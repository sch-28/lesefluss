/**
 * PageView — paginated, e-ink-style page-turn reader with a sliding-window
 * chunk model so cross-chunk navigation is as smooth as within-chunk.
 *
 * Sliding window: at any time, up to 3 chunks are mounted side-by-side
 * (prev / current / next). The transform on the wrapper navigates through
 * all of them as one continuous translateX — there's no "swap and snap"
 * at chunk boundaries because the next chunk is already laid out alongside
 * the current one. After the user settles in a different chunk, we
 * re-anchor (the window slides), the now-far chunk unmounts, and the new
 * far chunk pre-mounts in the background. React reconciles by chunk-index
 * key, so chunks that remain in the new window keep their DOM intact (no
 * relayout cost).
 *
 * Each chunk is its own multicol container. Explicit pixel width/height
 * are required for `column-fill: auto` to overflow into horizontally-
 * stacked columns; chained `height: 100%` from IonContent has been seen
 * to be "indefinite" enough for some WebKit/Blink builds to fall back to
 * `column-fill: balance` and cram everything into one tall column.
 *
 * DOM layers:
 *   .page-view (outer) — horizontal padding for the reader margin
 *     .page-clip      — overflow:hidden at exactly the column area, so CSS
 *                       columns overflowing past their host don't paint
 *                       into the padding region
 *       .transform-wrapper — the element that gets translateX
 *         <ChunkContent>×N — absolutely-positioned chunks in the wrapper
 *
 * Position model: same UTF-8 byte offsets as scroll mode. On page settle
 * the first fully-visible word span on the current page is the saved
 * position.
 *
 * What this file deliberately doesn't do (planned follow-ups, see Backlog):
 *   - Skeleton overlay during initial mount.
 *   - Two-page spread on wide viewports (TASK-97).
 *   - Cross-chunk highlight selection (TASK-96).
 *   - Per-book hyphenation language (TASK-98).
 */
import type React from "react";
import {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { flushSync } from "react-dom";
import {
	cancelAnyActiveLongPress,
	type GlossaryRangeProp,
	type HighlightRange,
	LONG_PRESS_MS,
} from "../paragraph";
import type { ReaderViewHandle } from "../view-types";
import ChunkContent from "./chunk-content";
import {
	buildChunks,
	findChunkForByte,
	pageCountOf,
	relativeOffsets,
	visibleWindow,
} from "./chunks";
import { findPageForByte, readFirstVisibleByteOffset } from "./measurements";

// ─── Tuning ──────────────────────────────────────────────────────────────────
const TAP_THRESHOLD_PX = 8; // movement under this is a tap, not a swipe
const SWIPE_COMMIT_FRACTION = 0.22; // swipe must cross this fraction of pageWidth to commit
const RUBBER_BAND_FACTOR = 0.4; // resistance at the absolute first/last page
const PAGE_TRANSITION_MS = 220;
const TAP_ZONE_FRACTION = 0.33; // left/right third of viewport

// ─── Component ───────────────────────────────────────────────────────────────

export interface PageViewProps {
	paragraphs: string[];
	paragraphOffsets: number[];
	contentLength: number;
	initialByteOffset: number;

	// Appearance
	fontSize: number;
	fontFamily: string;
	lineSpacing: number;
	margin: number;
	showActiveWordUnderline: boolean;

	// Active highlight + per-paragraph annotation data (passed to <Paragraph>).
	activeOffset: number;
	highlightsByParagraph: Map<number, HighlightRange[]> | undefined;
	glossaryByParagraph: Map<number, GlossaryRangeProp[]> | undefined;
	selectionRange: { start: number; end: number } | null;
	isSelecting: boolean;

	// Word interaction
	onWordTap: (offset: number, text: string) => void;
	onWordLongPress: (offset: number) => void;
	onWordMouseDragStart: (offset: number, ev: PointerEvent) => void;
	onCancelSelection: () => void;

	// Position reporting
	onPositionSettle: (byteOffset: number) => void;
	onInitialActiveOffset: (byteOffset: number) => void;
	onTap: () => void;

	/**
	 * Optional element overlaid at the bottom of the page area, visible only
	 * on the absolute last page of the book. Used by the reader to render
	 * `<NextChapterFooter />` for serial chapters. Positioned outside the
	 * transform wrapper so the page-chunk pagination math stays untouched.
	 */
	footer?: React.ReactNode;
}

const PageView = forwardRef<ReaderViewHandle, PageViewProps>(function PageView(
	{
		paragraphs,
		paragraphOffsets,
		contentLength,
		initialByteOffset,
		fontSize,
		fontFamily,
		lineSpacing,
		margin,
		showActiveWordUnderline,
		activeOffset,
		highlightsByParagraph,
		glossaryByParagraph,
		selectionRange,
		isSelecting,
		onWordTap,
		onWordLongPress,
		onWordMouseDragStart,
		onCancelSelection,
		onPositionSettle,
		onInitialActiveOffset,
		onTap,
		footer,
	},
	ref,
) {
	const chunks = useMemo(
		() => buildChunks(paragraphs, paragraphOffsets, contentLength),
		[paragraphs, paragraphOffsets, contentLength],
	);

	// ── State ──────────────────────────────────────────────────────────────
	const [chunkIndex, setChunkIndex] = useState(() => findChunkForByte(chunks, initialByteOffset));
	const [pageIndex, setPageIndex] = useState(0);
	const [chunkWidths, setChunkWidths] = useState<ReadonlyMap<number, number>>(() => new Map());
	const [viewport, setViewport] = useState<{ w: number; h: number } | null>(null);
	const [isReady, setIsReady] = useState(false);
	const isReadyRef = useRef(false);
	const hasMountedRef = useRef(false);

	// ── Refs ───────────────────────────────────────────────────────────────
	const containerRef = useRef<HTMLDivElement>(null);
	const transformWrapperRef = useRef<HTMLDivElement>(null);
	const chunkRefs = useRef<Map<number, HTMLDivElement>>(new Map());
	const pendingTargetRef = useRef<number | null>(initialByteOffset);
	const animationTimeoutRef = useRef<number | null>(null);

	// Drag/swipe — refs not state, since pointermove updates at 60Hz.
	const dragRef = useRef<{
		originX: number;
		originY: number;
		originT: number;
		baseTranslate: number;
		isHorizontal: boolean | null;
		pointerId: number;
	} | null>(null);

	// True while a CSS transition is in flight (set by animateTo, cleared on
	// completion). The transform-sync layout effect skips while this is true so
	// it doesn't yank the in-progress animation to a stop with `transition: none`.
	const isAnimatingRef = useRef(false);
	// Mirrors of animateTo's target + onDone so a new gesture mid-animation can
	// snap the visual to the target and synchronously commit the pending state
	// change (re-anchor / settle) — without these the timer would fire later
	// mid-drag and yank state out from under the user.
	const animationTargetRef = useRef<number | null>(null);
	const pendingOnDoneRef = useRef<(() => void) | null>(null);

	// ── Derived ────────────────────────────────────────────────────────────
	const pageWidth = viewport ? Math.max(0, viewport.w - 2 * margin) : 0;
	const pageHeight = viewport ? viewport.h : 0;
	const isLayoutReady = pageWidth > 0 && pageHeight > 0;

	const visibleIndices = useMemo(
		() => visibleWindow(chunkIndex, chunks.length),
		[chunkIndex, chunks.length],
	);
	const offsets = useMemo(
		() => relativeOffsets(visibleIndices, chunkIndex, chunkWidths, pageWidth),
		[visibleIndices, chunkIndex, chunkWidths, pageWidth],
	);

	const currentChunkWidth = chunkWidths.get(chunkIndex);
	const currentPageCount = currentChunkWidth ? pageCountOf(currentChunkWidth, pageWidth) : 1;

	// ── Transform writer (direct DOM, bypasses React for hot paths) ───────
	// Set transition FIRST so the upcoming transform change actually animates.
	const setTransform = useCallback((px: number, withTransition = false) => {
		const el = transformWrapperRef.current;
		if (!el) return;
		el.style.transition = withTransition ? `transform ${PAGE_TRANSITION_MS}ms ease` : "none";
		el.style.transform = `translateX(${px}px)`;
	}, []);

	const computeTransform = useCallback(
		(p = pageIndex) => -((offsets.get(chunkIndex) ?? 0) + p * pageWidth),
		[offsets, chunkIndex, pageIndex, pageWidth],
	);

	// ── Stable refs for parent callbacks (so layout effects don't churn) ──
	const onInitialActiveOffsetRef = useRef(onInitialActiveOffset);
	const onPositionSettleRef = useRef(onPositionSettle);
	useEffect(() => {
		onInitialActiveOffsetRef.current = onInitialActiveOffset;
		onPositionSettleRef.current = onPositionSettle;
	}, [onInitialActiveOffset, onPositionSettle]);

	// ── Viewport tracking ─────────────────────────────────────────────────
	useLayoutEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const measure = () => {
			const r = el.getBoundingClientRect();
			setViewport((prev) =>
				prev && prev.w === r.width && prev.h === r.height ? prev : { w: r.width, h: r.height },
			);
		};
		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	// ── Chunk measurement callback ────────────────────────────────────────
	const handleChunkMeasure = useCallback((idx: number, width: number) => {
		setChunkWidths((prev) => {
			if (prev.get(idx) === width) return prev;
			const next = new Map(prev);
			next.set(idx, width);
			return next;
		});
	}, []);

	const registerChunkRef = useCallback((idx: number, el: HTMLDivElement | null) => {
		if (el) chunkRefs.current.set(idx, el);
		else chunkRefs.current.delete(idx);
	}, []);

	// ── Initial-mount / chunk-swap lander ─────────────────────────────────
	// Fires once the current chunk has been measured. Finds the page that
	// contains the pending target byte offset, lands on it, reveals the view,
	// and emits the initial-active or position-settle callback.
	useLayoutEffect(() => {
		if (!isLayoutReady || !currentChunkWidth) return;
		const target = pendingTargetRef.current;
		if (target === null) return;
		const el = chunkRefs.current.get(chunkIndex);
		if (!el) return;
		pendingTargetRef.current = null;
		const targetPage = findPageForByte(el, pageWidth, currentPageCount, target);
		setPageIndex(targetPage);
		// Transform sync runs in its own layout effect below — by the time it
		// fires, pageIndex has been committed and the transform lands cleanly.
		if (!isReadyRef.current) {
			isReadyRef.current = true;
			setIsReady(true);
			if (!hasMountedRef.current) {
				hasMountedRef.current = true;
				onInitialActiveOffsetRef.current(target);
			} else {
				onPositionSettleRef.current(target);
			}
		}
	}, [chunkIndex, currentChunkWidth, currentPageCount, isLayoutReady, pageWidth]);

	// ── Transform sync ────────────────────────────────────────────────────
	// Runs whenever state that affects the resting transform changes (chunk
	// re-anchor, chunk-width measurement, viewport size). Keeps the wrapper's
	// translateX aligned with the current chunk + page without animation —
	// animation paths set the transform imperatively. Skipped during an
	// in-flight animation to avoid cancelling it.
	// `computeTransform` is intentionally omitted from deps — its identity
	// already changes whenever any of its inputs change, so listing both is
	// just noise.
	// biome-ignore lint/correctness/useExhaustiveDependencies: see above
	useLayoutEffect(() => {
		if (!isLayoutReady || isAnimatingRef.current) return;
		setTransform(computeTransform());
	}, [chunkIndex, pageIndex, offsets, pageWidth, isLayoutReady, setTransform]);

	// ── Animation primitives ──────────────────────────────────────────────
	const animateTo = useCallback(
		(translatePx: number, onDone?: () => void) => {
			if (animationTimeoutRef.current !== null) {
				window.clearTimeout(animationTimeoutRef.current);
			}
			isAnimatingRef.current = true;
			animationTargetRef.current = translatePx;
			pendingOnDoneRef.current = onDone ?? null;
			setTransform(translatePx, true);
			animationTimeoutRef.current = window.setTimeout(() => {
				animationTimeoutRef.current = null;
				isAnimatingRef.current = false;
				const done = pendingOnDoneRef.current;
				pendingOnDoneRef.current = null;
				animationTargetRef.current = null;
				done?.();
			}, PAGE_TRANSITION_MS);
		},
		[setTransform],
	);

	/** Force the in-flight animation to its end-state synchronously: cancel the
	 *  timer, snap the wrapper to the animation's target, and run the pending
	 *  onDone via flushSync so React state catches up before the next gesture
	 *  reads it. Without this, starting a drag mid-animation would (a) snap
	 *  the wrapper from its current visual to a stale `computeTransform()` value
	 *  and (b) leave the original timer firing later, mid-drag — both visible
	 *  as "the previous animation re-triggers".
	 *
	 *  The snap and the flushSync target different completion paths:
	 *    - Within-chunk (onDone = settleAtPage): no PageView state change, so
	 *      the transform-sync layout effect doesn't re-fire. The snap IS what
	 *      positions the wrapper at the animation's intended end.
	 *    - Cross-chunk (onDone = re-anchor): `setChunkIndex` + `setPageIndex`
	 *      change state, transform-sync re-fires, and overwrites the snap with
	 *      the post-re-anchor value. The two values are visually equivalent
	 *      because the chunks reposition to compensate, so no visible jump. */
	const completeInFlightAnimation = useCallback(() => {
		if (!isAnimatingRef.current) return;
		if (animationTimeoutRef.current !== null) {
			window.clearTimeout(animationTimeoutRef.current);
			animationTimeoutRef.current = null;
		}
		isAnimatingRef.current = false;
		const target = animationTargetRef.current;
		animationTargetRef.current = null;
		if (target !== null && transformWrapperRef.current) {
			transformWrapperRef.current.style.transition = "none";
			transformWrapperRef.current.style.transform = `translateX(${target}px)`;
		}
		const done = pendingOnDoneRef.current;
		pendingOnDoneRef.current = null;
		if (done) flushSync(done);
	}, []);

	useEffect(
		() => () => {
			if (animationTimeoutRef.current !== null) {
				window.clearTimeout(animationTimeoutRef.current);
			}
		},
		[],
	);

	// ── Navigation ────────────────────────────────────────────────────────
	const settleAtPage = useCallback(
		(p: number) => {
			const el = chunkRefs.current.get(chunkIndex);
			if (!el) return;
			const byte = readFirstVisibleByteOffset(el, pageWidth, p);
			if (byte !== null) onPositionSettle(byte);
		},
		[chunkIndex, pageWidth, onPositionSettle],
	);

	const goToPage = useCallback(
		(p: number) => {
			if (!isLayoutReady) return;
			const clamped = Math.max(0, Math.min(currentPageCount - 1, p));
			setPageIndex(clamped);
			animateTo(computeTransform(clamped), () => settleAtPage(clamped));
		},
		[isLayoutReady, currentPageCount, animateTo, computeTransform, settleAtPage],
	);

	/** Cross-chunk advance. The next chunk is already mounted next to the
	 *  current one, so the animation slides smoothly into it; on settle we
	 *  re-anchor (the layout effect above resets the transform to keep the
	 *  visual position constant while the chunk window shifts). */
	const crossToNeighbor = useCallback(
		(direction: 1 | -1) => {
			if (!isLayoutReady) return;
			const neighborIdx = chunkIndex + direction;
			if (neighborIdx < 0 || neighborIdx >= chunks.length) return;
			const neighborOffset = offsets.get(neighborIdx);
			const neighborWidth = chunkWidths.get(neighborIdx);
			// If the neighbor hasn't reported a width yet (shouldn't normally
			// happen mid-read, but possible right after mount), defer to a snap.
			if (neighborOffset === undefined || neighborWidth === undefined) {
				const fallbackPages = pageCountOf(neighborWidth ?? pageWidth, pageWidth);
				animateTo(computeTransform(), () => {
					setChunkIndex(neighborIdx);
					setPageIndex(direction === 1 ? 0 : fallbackPages - 1);
				});
				return;
			}
			const neighborPages = pageCountOf(neighborWidth, pageWidth);
			const targetPage = direction === 1 ? 0 : neighborPages - 1;
			const targetTranslate = -(neighborOffset + targetPage * pageWidth);
			animateTo(targetTranslate, () => {
				setChunkIndex(neighborIdx);
				setPageIndex(targetPage);
				const el = chunkRefs.current.get(neighborIdx);
				if (el) {
					const byte = readFirstVisibleByteOffset(el, pageWidth, targetPage);
					if (byte !== null) onPositionSettle(byte);
				}
			});
		},
		[
			isLayoutReady,
			chunkIndex,
			chunks.length,
			offsets,
			chunkWidths,
			pageWidth,
			animateTo,
			computeTransform,
			onPositionSettle,
		],
	);

	const goNext = useCallback(() => {
		if (pageIndex < currentPageCount - 1) goToPage(pageIndex + 1);
		else if (chunkIndex < chunks.length - 1) crossToNeighbor(1);
		else animateTo(computeTransform()); // snap back from rubber-band at end
	}, [
		pageIndex,
		currentPageCount,
		chunkIndex,
		chunks.length,
		goToPage,
		crossToNeighbor,
		animateTo,
		computeTransform,
	]);

	const goPrev = useCallback(() => {
		if (pageIndex > 0) goToPage(pageIndex - 1);
		else if (chunkIndex > 0) crossToNeighbor(-1);
		else animateTo(computeTransform()); // snap back from rubber-band at start
	}, [pageIndex, chunkIndex, goToPage, crossToNeighbor, animateTo, computeTransform]);

	// ── Imperative jumpTo (chapter / search / highlight-list) ─────────────
	useImperativeHandle(
		ref,
		() => ({
			jumpTo(byteOffset) {
				const targetChunk = findChunkForByte(chunks, byteOffset);
				if (targetChunk !== chunkIndex) {
					// Cross-chunk jump: reset the chunk window to the target and let
					// the lander effect place us on the right page once it measures.
					pendingTargetRef.current = byteOffset;
					setChunkIndex(targetChunk);
					return;
				}
				if (!isLayoutReady) return;
				const el = chunkRefs.current.get(chunkIndex);
				if (!el) return;
				const targetPage = findPageForByte(el, pageWidth, currentPageCount, byteOffset);
				goToPage(targetPage);
			},
			goNext,
			goPrev,
		}),
		[chunks, chunkIndex, pageWidth, currentPageCount, isLayoutReady, goToPage, goNext, goPrev],
	);

	// ── Pointer gestures ──────────────────────────────────────────────────
	const routeTap = (clientX: number): "prev" | "next" | "center" => {
		const r = containerRef.current?.getBoundingClientRect();
		if (!r || !isLayoutReady) return "center";
		const xWithinColumn = clientX - r.left - margin;
		if (xWithinColumn < pageWidth * TAP_ZONE_FRACTION) return "prev";
		if (xWithinColumn > pageWidth * (1 - TAP_ZONE_FRACTION)) return "next";
		return "center";
	};

	const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
		if (!isLayoutReady) return;
		// Don't start a drag on the long-press handle hit-zone (selection extension wins).
		if ((e.target as HTMLElement | null)?.closest(".selection-handle")) return;
		// If an animation is in flight, complete it (snap + commit pending state)
		// so the new gesture starts from a consistent visual + state baseline.
		completeInFlightAnimation();
		// Read the actual DOM transform so the drag follows the visible wrapper
		// position, not a stale closure-derived `computeTransform()`. After
		// completeInFlightAnimation + flushSync, this reflects the new state.
		// `?? 0` handles the cold-start case where the wrapper has never had a
		// transform set — by pointer-down time that's effectively impossible
		// (transform-sync runs at first layout), but keeping the fallback to a
		// numeric primitive avoids depending on a stale closure for `computeTransform()`.
		const baseTranslate = readDomTranslateX(transformWrapperRef.current) ?? 0;
		dragRef.current = {
			originX: e.clientX,
			originY: e.clientY,
			originT: e.timeStamp,
			baseTranslate,
			isHorizontal: null,
			pointerId: e.pointerId,
		};
	};

	const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
		const d = dragRef.current;
		if (!d || !isLayoutReady) return;
		if (e.pointerId !== d.pointerId) return;
		const dx = e.clientX - d.originX;
		const dy = e.clientY - d.originY;

		if (d.isHorizontal === null) {
			if (Math.abs(dx) < TAP_THRESHOLD_PX && Math.abs(dy) < TAP_THRESHOLD_PX) return;
			d.isHorizontal = Math.abs(dx) > Math.abs(dy);
			if (!d.isHorizontal) {
				dragRef.current = null;
				return;
			}
			cancelAnyActiveLongPress();
			if (isSelecting) onCancelSelection();
			(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		}

		// Rubber-band only at the absolute book ends — within the chunk window
		// the user is free to drag into adjacent chunks at full 1:1 ratio.
		let effectiveDx = dx;
		const atAbsoluteStart = chunkIndex === 0 && pageIndex === 0 && dx > 0;
		const atAbsoluteEnd =
			chunkIndex === chunks.length - 1 && pageIndex === currentPageCount - 1 && dx < 0;
		if (atAbsoluteStart || atAbsoluteEnd) effectiveDx = dx * RUBBER_BAND_FACTOR;

		setTransform(d.baseTranslate + effectiveDx);
	};

	const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
		const d = dragRef.current;
		dragRef.current = null;
		if (!isLayoutReady) return;

		const dx = d ? e.clientX - d.originX : 0;
		const dy = d ? e.clientY - d.originY : 0;
		const dt = d ? e.timeStamp - d.originT : 0;
		const wasHorizontalDrag = d?.isHorizontal === true;

		// A release that exceeded the long-press hold time is not a tap — the
		// long-press handler already fired and entered selection mode, so we
		// must not let the "tap-elsewhere dismisses selection" branch below
		// cancel the selection the user just created.
		const wasLongPress = dt >= LONG_PRESS_MS;
		const isTap =
			!wasHorizontalDrag &&
			!wasLongPress &&
			Math.abs(dx) < TAP_THRESHOLD_PX &&
			Math.abs(dy) < TAP_THRESHOLD_PX;
		if (isTap) {
			if (isSelecting) {
				onCancelSelection();
				return;
			}
			const zone = routeTap(e.clientX);
			if (zone === "prev") goPrev();
			else if (zone === "next") goNext();
			else onTap();
			return;
		}

		if (!wasHorizontalDrag) return;

		const threshold = pageWidth * SWIPE_COMMIT_FRACTION;
		if (dx <= -threshold) goNext();
		else if (dx >= threshold) goPrev();
		else animateTo(computeTransform()); // snap back to current page
	};

	const handlePointerCancel = () => {
		dragRef.current = null;
		if (!isLayoutReady) return;
		animateTo(computeTransform());
	};

	// ── Render ────────────────────────────────────────────────────────────
	// True when the user is on the very last page of the very last chunk.
	// Drives the optional `footer` overlay; the same boolean shape appears
	// inside `handlePointerMove` (rubber-band) but each usage owns its own
	// computation to keep pointer-handler closures from going stale.
	const isLastPage = chunkIndex === chunks.length - 1 && pageIndex === currentPageCount - 1;

	return (
		<div
			ref={containerRef}
			className="page-view"
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
			onPointerCancel={handlePointerCancel}
			style={{
				position: "relative",
				height: "100%",
				width: "100%",
				maxWidth: "700px",
				margin: "0 auto",
				padding: `0 ${margin}px`,
				boxSizing: "border-box",
				touchAction: "pan-y",
				userSelect: "none",
				opacity: isReady ? 1 : 0,
				...({ "--reader-line-height": String(lineSpacing) } as React.CSSProperties),
			}}
		>
			{/* page-clip: bounds the visible page area exactly to the column box.
			 *  Without this intermediary, .page-view's own clipping would be at
			 *  the padding edge — leaving a margin-px gap on each side where the
			 *  next/previous chunk would visibly bleed into the reader margin. */}
			<div style={{ width: "100%", height: "100%", overflow: "hidden", position: "relative" }}>
				{/* The transform wrapper. Pre-mounting the inner DOM is gated on
				 *  isLayoutReady — without real pixel dimensions, multicol does
				 *  expensive layout work for nothing and blocks the JS thread. */}
				{isLayoutReady && (
					<div
						ref={transformWrapperRef}
						style={{
							position: "absolute",
							left: 0,
							top: 0,
							width: "100%",
							height: "100%",
							willChange: "transform",
						}}
					>
						{visibleIndices.map((idx) => {
							const chunk = chunks[idx];
							if (!chunk) return null;
							// Pass the real activeOffset only to the chunk that contains
							// it — others get -1 so taps don't re-render the entire window.
							const isActiveChunk = activeOffset >= chunk.startByte && activeOffset < chunk.endByte;
							return (
								<ChunkContent
									key={idx}
									chunkIndex={idx}
									chunk={chunk}
									paragraphs={paragraphs}
									paragraphOffsets={paragraphOffsets}
									leftOffset={offsets.get(idx) ?? 0}
									pageWidth={pageWidth}
									pageHeight={pageHeight}
									fontSize={fontSize}
									fontFamily={fontFamily}
									showActiveWordUnderline={showActiveWordUnderline}
									// TODO (TASK-98): source from book metadata once available —
									// affects hyphenation quality on non-English books.
									lang="en"
									activeOffset={isActiveChunk ? activeOffset : -1}
									highlightsByParagraph={highlightsByParagraph}
									glossaryByParagraph={glossaryByParagraph}
									selectionRange={selectionRange}
									onWordTap={onWordTap}
									onWordLongPress={onWordLongPress}
									onWordMouseDragStart={onWordMouseDragStart}
									onMeasure={handleChunkMeasure}
									registerRef={registerChunkRef}
								/>
							);
						})}
					</div>
				)}
			</div>
			{/* End-of-book footer overlay (e.g. <NextChapterFooter /> for serials).
			 *  Lives outside the page-clip / transform wrapper so it doesn't move
			 *  with page swipes and doesn't perturb the chunk pagination math.
			 *  Visible only when the user is on the very last page. */}
			{footer != null && isLastPage && (
				<div
					style={{
						position: "absolute",
						left: 0,
						right: 0,
						bottom: "env(safe-area-inset-bottom, 0px)",
						pointerEvents: "auto",
					}}
				>
					{footer}
				</div>
			)}
		</div>
	);
});

export default PageView;

/** Reads the current X-translate from a transformed element by parsing its
 *  computed matrix. Used to find the visual position when starting a gesture
 *  mid-animation — we can't use closure state because that's the animation's
 *  target, not where the wrapper actually is right now on screen. */
function readDomTranslateX(el: HTMLElement | null): number | null {
	if (!el) return null;
	const computed = window.getComputedStyle(el).transform;
	if (!computed || computed === "none") return null;
	const match = /^matrix(?:3d)?\(([^)]+)\)/.exec(computed);
	if (!match) return null;
	const parts = match[1].split(",").map((s) => Number.parseFloat(s.trim()));
	// matrix(a, b, c, d, tx, ty) → tx at index 4
	// matrix3d(...16 values...) → tx at index 12
	const tx = parts.length === 6 ? parts[4] : parts[12];
	return Number.isFinite(tx) ? tx : null;
}
