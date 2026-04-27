/**
 * ScrollView - the virtualized scroll-mode reader, extracted from the parent
 * BookReader so it sits as a sibling of RsvpView (and the upcoming PageView).
 *
 * Owns scroll-mode internals: the VList, fine-scroll machinery, skeleton
 * overlay, scroll handlers, and the suppress-refs that keep programmatic
 * jumps from clobbering saved positions. State that crosses modes
 * (activeOffset, progressOffset, lastOffsetRef, savePosition) lives in the
 * parent and is plumbed in via callbacks.
 *
 * Behavior here is a verbatim extraction — see git history of index.tsx for
 * the original logic. No semantic changes.
 */
import type React from "react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { VListHandle } from "virtua";
import { VList } from "virtua";
import Paragraph, {
	cancelAnyActiveLongPress,
	type GlossaryRangeProp,
	type HighlightRange,
} from "./paragraph";
import type { ReaderViewHandle } from "./view-types";

// ─── Module-level singletons ─────────────────────────────────────────────────

// Fine-scroll tuning (see scheduleFineScroll).
const FINE_SCROLL_MOUNT_FRAME_BUDGET = 10;
const FINE_SCROLL_STABILITY_TICK_MS = 50;
const FINE_SCROLL_STABILITY_TIMEOUT_MS = 600;

// Locate the alignment target span within `container`.
// Prefers the exact byte offset; falls back to the largest data-offset ≤ byteOffset
// within [paragraphStart, paragraphEnd). The fallback handles stale saved positions
// (older parse, drifted offsets) without leaking into the wrong paragraph.
function findAlignmentSpan(
	container: HTMLElement,
	byteOffset: number,
	paragraphStart: number,
	paragraphEnd: number,
): HTMLElement | null {
	const exact = container.querySelector<HTMLElement>(`span[data-offset="${byteOffset}"]`);
	if (exact) return exact;
	let best: HTMLElement | null = null;
	for (const span of container.querySelectorAll<HTMLElement>("span[data-offset]")) {
		const off = Number.parseInt(span.dataset.offset ?? "", 10);
		if (Number.isNaN(off) || off < paragraphStart || off >= paragraphEnd || off > byteOffset) {
			continue;
		}
		if (!best || off > Number(best.dataset.offset)) best = span;
	}
	return best;
}

interface ScrollSuppressRefs {
	suppressScrollEnd: React.RefObject<boolean>;
	suppressHighlight: React.RefObject<boolean>;
}

// Scrolls so the span at `byteOffset` lands flush at the top of the container —
// symmetric with handleScrollEnd's save rule (`rect.top >= cutoffTop`).
//
// Phases:
//   1. document.fonts.ready (cold-start fallback-font guard)
//   2. rAF retry until the target span is mounted
//   3. Stability poll: wait until container.scrollHeight is unchanged for two
//      consecutive 50ms samples → VList has finished reconciling estimated
//      paragraph heights with real measurements (max 600ms timeout).
//   4. One scrollBy(delta). Done — no watcher, no retry loop.
//
// `onReady` (optional) fires after the final scroll so the caller can reveal
// hidden content.
function scheduleFineScroll(
	listHandle: VListHandle,
	container: HTMLElement,
	byteOffset: number,
	paragraphStart: number,
	paragraphEnd: number,
	suppress: ScrollSuppressRefs,
	shouldHighlight: boolean,
	onReady?: () => void,
): () => void {
	let mountAttempts = 0;
	let rafId = 0;
	let timeoutId = 0;
	let cancelled = false;

	const alignSpan = (span: HTMLElement) => {
		if (cancelled) return;
		const delta = span.getBoundingClientRect().top - container.getBoundingClientRect().top;
		if (Math.abs(delta) > 2) {
			suppress.suppressScrollEnd.current = true;
			if (shouldHighlight) suppress.suppressHighlight.current = true;
			listHandle.scrollBy(delta);
		}
		onReady?.();
	};

	const waitForStability = (span: HTMLElement) => {
		const startedAt = performance.now();
		let lastHeight = container.scrollHeight;
		let stableSamples = 0;
		const tick = () => {
			if (cancelled) return;
			const h = container.scrollHeight;
			if (h === lastHeight) {
				stableSamples++;
				if (
					stableSamples >= 2 ||
					performance.now() - startedAt >= FINE_SCROLL_STABILITY_TIMEOUT_MS
				) {
					alignSpan(span);
					return;
				}
			} else {
				lastHeight = h;
				stableSamples = 0;
			}
			timeoutId = window.setTimeout(tick, FINE_SCROLL_STABILITY_TICK_MS);
		};
		timeoutId = window.setTimeout(tick, FINE_SCROLL_STABILITY_TICK_MS);
	};

	const awaitMount = () => {
		if (cancelled) return;
		const span = findAlignmentSpan(container, byteOffset, paragraphStart, paragraphEnd);
		if (span) {
			waitForStability(span);
			return;
		}
		if (mountAttempts++ < FINE_SCROLL_MOUNT_FRAME_BUDGET) {
			rafId = requestAnimationFrame(awaitMount);
		} else {
			// Span never mounted (stale offset outside DOM after the fallback failed).
			// Fire onReady anyway so callers don't leave the reader hidden forever.
			onReady?.();
		}
	};

	const start = () => {
		if (cancelled) return;
		rafId = requestAnimationFrame(awaitMount);
	};

	if (document.fonts) {
		void document.fonts.ready.then(start);
	} else {
		start();
	}

	return () => {
		cancelled = true;
		if (rafId) cancelAnimationFrame(rafId);
		if (timeoutId) clearTimeout(timeoutId);
	};
}

// ─── Skeleton loading lines ──────────────────────────────────────────────────
const skeletonLines = Array.from({ length: 40 }, (_, i) => ({
	width: `${60 + ((i * 17) % 35)}%`,
	marginBottom: i % 4 === 3 ? "20px" : "10px",
}));

const ReaderSkeleton: React.FC<{ style?: React.CSSProperties }> = ({ style }) => (
	<div style={{ padding: "16px 20px", height: "100%", overflow: "hidden", ...style }}>
		{skeletonLines.map((lineStyle, i) => (
			// biome-ignore lint/suspicious/noArrayIndexKey: static style array, index is stable
			<div key={i} className="reader-skeleton-line" style={lineStyle} />
		))}
	</div>
);

// ─── Component ───────────────────────────────────────────────────────────────

export interface ScrollViewProps {
	paragraphs: string[];
	paragraphOffsets: number[];
	findParagraphIndex: (targetByte: number) => number;
	initialByteOffset: number;

	// Appearance
	fontSize: number;
	fontFamily: string; // "sans" | "serif" — db column is plain text
	lineSpacing: number;
	margin: number;
	showActiveWordUnderline: boolean;

	// Active highlight + per-paragraph annotation data (passed straight to <Paragraph>).
	activeOffset: number;
	highlightsByParagraph: Map<number, HighlightRange[]> | undefined;
	glossaryByParagraph: Map<number, GlossaryRangeProp[]> | undefined;
	selectionRange: { start: number; end: number } | null;

	// Word interaction
	onWordTap: (offset: number, text: string) => void;
	onWordLongPress: (offset: number) => void;
	onWordMouseDragStart: (offset: number, ev: PointerEvent) => void;

	// Scroll-driven side effects routed back to parent
	onPositionSettle: (byteOffset: number) => void; // handleScrollEnd → final saved offset
	onInitialActiveOffset: (byteOffset: number) => void; // fires once during initial scroll — sets the highlight without saving
	onProgressChange: (byteOffset: number) => void; // continuous during scroll
	onHighlightClear: () => void; // scroll started → hide highlight (parent decides on NO_HIGHLIGHT optimization)
	onHideProgressBar: () => void; // scroll started (and not scrubbing) → hide bar
	onTap: () => void; // any click inside container → show progress bar

	// Selection-during-scroll: parent hands these in so handlers re-sync drag handles
	isSelecting: boolean;
	syncSelectionHandles: () => void;

	// Lets handleScroll skip onHideProgressBar while a scrub gesture is in-flight
	isScrubbingRef: React.RefObject<boolean>;
}

const ScrollView = forwardRef<ReaderViewHandle, ScrollViewProps>(function ScrollView(
	{
		paragraphs,
		paragraphOffsets,
		findParagraphIndex,
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
		onWordTap,
		onWordLongPress,
		onWordMouseDragStart,
		onPositionSettle,
		onInitialActiveOffset,
		onProgressChange,
		onHighlightClear,
		onHideProgressBar,
		onTap,
		isSelecting,
		syncSelectionHandles,
		isScrubbingRef,
	},
	ref,
) {
	const listRef = useRef<VListHandle>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	// Whether the initial scroll-to-position has happened
	const didInitialScrollRef = useRef(false);

	// Suppresses the handleScrollEnd that fires after the programmatic
	// scrollToIndex on first render - prevents overwriting the precise
	// saved position with whatever word happens to be at the top.
	const suppressNextScrollEndRef = useRef(false);

	// Suppresses handleScroll from clearing activeOffset after a
	// programmatic jump (search, chapter). Without this the scroll
	// event fires *after* setActiveOffset and wipes the highlight.
	const suppressScrollHighlightClearRef = useRef(false);

	// Keeps the skeleton visible until the initial fine-scroll has landed, so the
	// user never sees VList reconcile heights mid-scroll. Flipped by onReady from
	// scheduleFineScroll. Only applies to the first open (jumps use the VList live).
	const [isInitialScrollReady, setIsInitialScrollReady] = useState(false);

	/** Align the word at `byteOffset` flush with the container top via scrollIntoView.
	 *  Paragraph-bounded so the fallback can't leak into a neighboring paragraph. */
	const fineScrollTo = useCallback(
		(byteOffset: number, shouldHighlight: boolean, onReady?: () => void) => {
			if (!listRef.current || !containerRef.current) return undefined;
			const idx = findParagraphIndex(byteOffset);
			const start = paragraphOffsets[idx] ?? 0;
			const end = paragraphOffsets[idx + 1] ?? Number.POSITIVE_INFINITY;
			return scheduleFineScroll(
				listRef.current,
				containerRef.current,
				byteOffset,
				start,
				end,
				{
					suppressScrollEnd: suppressNextScrollEndRef,
					suppressHighlight: suppressScrollHighlightClearRef,
				},
				shouldHighlight,
				onReady,
			);
		},
		[findParagraphIndex, paragraphOffsets],
	);

	// ── Initial scroll to saved position ──────────────────────────────────
	useEffect(() => {
		if (didInitialScrollRef.current) return;
		// Wait for refs + data. If content is loaded but paragraph list is empty
		// (malformed book), reveal the empty reader rather than staying hidden.
		if (!listRef.current) return;
		if (paragraphs.length === 0) {
			// Terminal: mark initial scroll done so a later paragraphs update
			// doesn't re-enter this effect and jerk an already-revealed reader.
			didInitialScrollRef.current = true;
			setIsInitialScrollReady(true);
			return;
		}

		didInitialScrollRef.current = true;

		const target = initialByteOffset;
		if (target === 0) {
			// start of book - default scroll is correct, nothing to wait for
			setIsInitialScrollReady(true);
			return;
		}

		const idx = findParagraphIndex(target);
		suppressNextScrollEndRef.current = true;
		suppressScrollHighlightClearRef.current = true;
		listRef.current.scrollToIndex(idx, { align: "start" });
		onInitialActiveOffset(target);

		return fineScrollTo(target, true, () => setIsInitialScrollReady(true));
	}, [paragraphs, initialByteOffset, findParagraphIndex, fineScrollTo, onInitialActiveOffset]);

	// ── Imperative jumpTo (chapter / search / highlight-list) ─────────────
	// Visual scroll only — parent has already updated active/progress/last/saved
	// via its jumpToOffset wrapper before calling this.
	useImperativeHandle(
		ref,
		() => ({
			jumpTo(byteOffset, { highlight = true } = {}) {
				if (!listRef.current) return;
				const idx = findParagraphIndex(byteOffset);
				suppressNextScrollEndRef.current = true;
				if (highlight) suppressScrollHighlightClearRef.current = true;
				listRef.current.scrollToIndex(idx, { align: "start" });
				fineScrollTo(byteOffset, highlight);
			},
		}),
		[findParagraphIndex, fineScrollTo],
	);

	// ── Scroll handler - hide highlight + update progress bar ──────────────
	const handleScroll = useCallback(
		(scrollOffset: number) => {
			// Cancel any pending long-press - user is scrolling, not selecting
			cancelAnyActiveLongPress();

			// Hide highlight while scrolling. After a programmatic jump
			// (search/chapter) we keep the highlight.
			if (!suppressScrollHighlightClearRef.current) {
				onHighlightClear();
			}
			// Hide progress bar - user is scrolling normally, not scrubbing
			if (!isScrubbingRef.current) onHideProgressBar();
			// Update the progress bar live. findItemIndex maps the current scroll
			// pixel offset to a paragraph index, which we convert to a byte offset.
			if (listRef.current && paragraphOffsets.length > 0) {
				const idx = Math.min(
					listRef.current.findItemIndex(scrollOffset),
					paragraphOffsets.length - 1,
				);
				onProgressChange(paragraphOffsets[idx] ?? 0);
			}
			// Re-sync handle positions when scrolling during selection
			if (isSelecting) {
				requestAnimationFrame(() => syncSelectionHandles());
			}
		},
		[
			paragraphOffsets,
			isSelecting,
			syncSelectionHandles,
			isScrubbingRef,
			onHighlightClear,
			onHideProgressBar,
			onProgressChange,
		],
	);

	// ── Scroll end - find top-of-container word + save position ──────────
	const handleScrollEnd = useCallback(() => {
		if (suppressNextScrollEndRef.current) {
			suppressNextScrollEndRef.current = false;
			suppressScrollHighlightClearRef.current = false;
			return;
		}
		// Don't save until the initial scroll-to-position has run,
		// otherwise a hot reload would overwrite the saved position with 0.
		if (!didInitialScrollRef.current) return;
		if (!listRef.current || !containerRef.current) return;

		const cutoffTop = containerRef.current.getBoundingClientRect().top;

		const spans = Array.from(document.querySelectorAll<HTMLElement>("span[data-offset]"));
		if (spans.length === 0) return;

		spans.sort((a, b) => {
			const ra = a.getBoundingClientRect();
			const rb = b.getBoundingClientRect();
			return ra.top !== rb.top ? ra.top - rb.top : ra.left - rb.left;
		});

		let bestOffset = -1;
		for (const span of spans) {
			if (span.getBoundingClientRect().top >= cutoffTop) {
				bestOffset = Number.parseInt(span.dataset.offset ?? "", 10);
				break;
			}
		}

		if (bestOffset < 0) return;

		onPositionSettle(bestOffset);
	}, [onPositionSettle]);

	// ── Show progress bar on any tap in the reading area ─────────────────
	// Native listener needed because VList's internal scroll container doesn't
	// propagate clicks through React's synthetic event system.
	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		el.addEventListener("click", onTap);
		return () => el.removeEventListener("click", onTap);
	}, [onTap]);

	return (
		// VList is always mounted so refs populate and the initial-scroll
		// effect can run. Opacity+pointer-events (not visibility) so VList
		// still lays out and measures — visibility:hidden can skip that on
		// some engines, which would break findAlignmentSpan. Skeleton is
		// overlaid on top until the fine-scroll onReady fires.
		<div style={{ position: "relative", height: "100%" }}>
			<div
				ref={containerRef}
				style={
					{
						height: "100%",
						maxWidth: "700px",
						margin: "0 auto",
						opacity: isInitialScrollReady ? 1 : 0,
						pointerEvents: isInitialScrollReady ? "auto" : "none",
						"--reader-line-height": String(lineSpacing),
					} as React.CSSProperties
				}
			>
				<VList
					ref={listRef}
					style={{
						height: "100%",
						padding: `0 ${margin}px`,
						paddingBottom: "calc(52px + env(safe-area-inset-bottom, 0px))",
						fontSize: `${fontSize}px`,
						fontFamily: fontFamily === "serif" ? "Georgia, 'Times New Roman', serif" : undefined,
					}}
					onScroll={handleScroll}
					onScrollEnd={handleScrollEnd}
				>
					{paragraphs.map((text, i) => (
						<Paragraph
							key={i.toString()}
							text={text}
							startOffset={paragraphOffsets[i]}
							activeOffset={activeOffset}
							onWordTap={onWordTap}
							onWordLongPress={onWordLongPress}
							onWordMouseDragStart={onWordMouseDragStart}
							highlights={highlightsByParagraph?.get(i)}
							glossaryRanges={glossaryByParagraph?.get(i)}
							selectionRange={selectionRange}
							showActiveWordUnderline={showActiveWordUnderline}
						/>
					))}
				</VList>
			</div>
			{!isInitialScrollReady && (
				<ReaderSkeleton
					style={{
						position: "absolute",
						inset: 0,
						background: "var(--ion-background-color)",
					}}
				/>
			)}
		</div>
	);
});

export default ScrollView;

export { ReaderSkeleton };
