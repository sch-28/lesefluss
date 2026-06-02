/**
 * ScrollView: virtualized scroll-mode reader. Owns VList, fine-scroll
 * machinery, skeleton overlay, scroll handlers, and the suppress-refs
 * that keep programmatic jumps from clobbering saved positions. Cross-mode
 * state (activeWord, progressWord, lastWordRef, savePosition) lives in
 * the parent and is plumbed in via callbacks. Word units throughout.
 */
import type React from "react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { VListHandle } from "virtua";
import { VList } from "virtua";
import Paragraph, {
	cancelAnyActiveLongPress,
	type GlossaryRangeProp,
	type HighlightRange,
	type LinkRangeProp,
	type ParagraphWordEntry,
} from "./paragraph";
import type { ReaderViewHandle } from "./view-types";

// ─── Module-level singletons ─────────────────────────────────────────────────

// Stable empty-entries fallback so memoized Paragraph doesn't bust on every
// render for entry-less paragraphs (e.g. headings).
const EMPTY_ENTRIES: readonly ParagraphWordEntry[] = [];

// Fine-scroll tuning (see scheduleFineScroll).
const FINE_SCROLL_MOUNT_FRAME_BUDGET = 10;
const FINE_SCROLL_STABILITY_TICK_MS = 50;
const FINE_SCROLL_STABILITY_TIMEOUT_MS = 600;
const INIT_SETTLE_COOLDOWN_MS = 500;

// Locate the alignment target span within `container`. Queries by `data-word`
// only. The paragraph-bounded fallback ensures a stale saved position
// doesn't leak into the wrong paragraph.
function findAlignmentSpan(
	container: HTMLElement,
	wordIdx: number,
	paragraphStartWord: number,
	paragraphEndWord: number,
): HTMLElement | null {
	const exact = container.querySelector<HTMLElement>(`span[data-word="${wordIdx}"]`);
	if (exact) return exact;
	let best: HTMLElement | null = null;
	for (const span of container.querySelectorAll<HTMLElement>("span[data-word]")) {
		const w = Number.parseInt(span.dataset.word ?? "", 10);
		if (
			Number.isNaN(w) ||
			w < 0 ||
			w < paragraphStartWord ||
			w >= paragraphEndWord ||
			w > wordIdx
		) {
			continue;
		}
		if (!best || w > Number(best.dataset.word)) best = span;
	}
	return best;
}

interface ScrollSuppressRefs {
	suppressScrollEnd: React.RefObject<boolean>;
	suppressHighlight: React.RefObject<boolean>;
}

// Scrolls so the span at `wordIdx` lands flush at the top of the container,
// symmetric with handleScrollEnd's save rule (`rect.top >= cutoffTop`).
//
// Phases:
//   1. document.fonts.ready (cold-start fallback-font guard)
//   2. rAF retry until the target span is mounted
//   3. Stability poll: wait until container.scrollHeight is unchanged for two
//      consecutive 50ms samples → VList has finished reconciling estimated
//      paragraph heights with real measurements (max 600ms timeout).
//   4. One scrollBy(delta). Done, no watcher, no retry loop.
//
// `onReady` (optional) fires after the final scroll so the caller can reveal
// hidden content.
function scheduleFineScroll(
	listHandle: VListHandle,
	container: HTMLElement,
	wordIdx: number,
	paragraphStartWord: number,
	paragraphEndWord: number,
	suppress: ScrollSuppressRefs,
	shouldHighlight: boolean,
	onReady?: () => void,
	smooth = false,
): () => void {
	let mountAttempts = 0;
	let rafId = 0;
	let timeoutId = 0;
	let cancelled = false;

	const SMOOTH_DURATION_MS = 250;

	const alignSpan = (span: HTMLElement) => {
		if (cancelled) return;
		const delta = span.getBoundingClientRect().top - container.getBoundingClientRect().top;
		if (Math.abs(delta) > 2) {
			suppress.suppressScrollEnd.current = true;
			if (shouldHighlight) suppress.suppressHighlight.current = true;
			if (!smooth) {
				listHandle.scrollBy(delta);
			} else {
				// VList only exposes scrollBy(offset), no smooth/behavior arg, so
				// drive the animation by hand: ease-out-cubic over a fixed window,
				// applying the per-frame delta. Cancelled if a newer scheduleFineScroll
				// starts (cancelled flag) or component unmounts.
				const startTime = performance.now();
				let appliedSoFar = 0;
				const tick = (now: number) => {
					if (cancelled) return;
					const t = Math.min(1, (now - startTime) / SMOOTH_DURATION_MS);
					const eased = 1 - (1 - t) ** 3;
					const target = delta * eased;
					const step = target - appliedSoFar;
					if (step !== 0) listHandle.scrollBy(step);
					appliedSoFar = target;
					if (t < 1) {
						rafId = requestAnimationFrame(tick);
					}
				};
				rafId = requestAnimationFrame(tick);
			}
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
		const span = findAlignmentSpan(container, wordIdx, paragraphStartWord, paragraphEndWord);
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
	/** Word index of each paragraph's first word. */
	paragraphStartWords: number[];
	/** Canonical WordIndex entries sliced per paragraph for span rendering. */
	entriesByParagraph: ParagraphWordEntry[][];
	/** Binary-search helper: paragraph index whose start word is ≤ targetWord. */
	findParagraphIndexForWord: (targetWord: number) => number;
	initialWord: number;

	// Appearance
	fontSize: number;
	fontFamily: string; // "sans" | "serif" (db column is plain text)
	lineSpacing: number;
	margin: number;
	showActiveWordUnderline: boolean;

	// Active highlight + per-paragraph annotation data (passed straight to <Paragraph>).
	/** Active word index (-1 to hide). */
	activeWord: number;
	highlightsByParagraph: Map<number, HighlightRange[]> | undefined;
	glossaryByParagraph: Map<number, GlossaryRangeProp[]> | undefined;
	linksByParagraph: Map<number, LinkRangeProp[]> | undefined;
	selectionRange: { startWord: number; endWord: number } | null;

	// Word interaction
	onWordTap: (offset: number, text: string) => void;
	onWordLongPress: (offset: number) => void;
	onWordMouseDragStart: (offset: number, ev: PointerEvent) => void;

	// Scroll-driven side effects routed back to parent (word units)
	onPositionSettle: (word: number) => void; // handleScrollEnd → final saved word
	onInitialActiveOffset: (word: number) => void; // fires once on initial scroll, sets highlight without saving
	onProgressChange: (word: number) => void; // continuous during scroll
	onHighlightClear: () => void; // scroll started → hide highlight (parent decides on NO_HIGHLIGHT optimization)
	onHideProgressBar: () => void; // scroll started (and not scrubbing) → hide bar
	onTap: () => void; // any click inside container → show progress bar

	// Selection-during-scroll: parent hands these in so handlers re-sync drag handles
	isSelecting: boolean;
	syncSelectionHandles: () => void;

	/**
	 * Optional element appended after the last paragraph inside the VList.
	 * Used by the reader to render `<NextChapterFooter />` for serial chapters;
	 * null/undefined for standalone books.
	 */
	footer?: React.ReactNode;

	// Lets handleScroll skip onHideProgressBar while a scrub gesture is in-flight
	isScrubbingRef: React.RefObject<boolean>;
}

const ScrollView = forwardRef<ReaderViewHandle, ScrollViewProps>(function ScrollView(
	{
		paragraphs,
		paragraphStartWords,
		entriesByParagraph,
		findParagraphIndexForWord,
		initialWord,
		fontSize,
		fontFamily,
		lineSpacing,
		margin,
		showActiveWordUnderline,
		activeWord,
		highlightsByParagraph,
		glossaryByParagraph,
		linksByParagraph,
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
		footer,
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
	// Mirror of isInitialScrollReady for synchronous reads inside handlers that
	// fire before React commits state. handleScrollEnd uses it to ignore the
	// post-initial-scroll scrollend(s) so opening a book doesn't trigger a
	// save (which would bump `lastRead` and re-broadcast the row as updated).
	const initialSettledRef = useRef(false);
	// Cooldown window for straggler scrollends from the init scroll sequence
	// (scrollToIndex + alignSpan's scrollBy each fire one; suppressNextScrollEndRef
	// is single-shot). Without this the second scrollend saves a top-of-viewport
	// word that's often off-by-one from the seed.
	const initialScrollDoneAtRef = useRef<number | null>(null);
	const markInitialSettled = useCallback(() => {
		initialSettledRef.current = true;
		initialScrollDoneAtRef.current = performance.now();
		setIsInitialScrollReady(true);
	}, []);

	// Cleanup for the in-flight initial scroll. Hoisted out of the init effect
	// so that effect re-runs don't cancel the scroll mid-flight and leave the
	// skeleton stuck. Only fires on unmount.
	const initialScrollCleanupRef = useRef<(() => void) | null>(null);
	useEffect(() => () => initialScrollCleanupRef.current?.(), []);

	/** Align the word at `wordIdx` flush with the container top via scrollIntoView.
	 *  Paragraph-bounded so the fallback can't leak into a neighboring paragraph.
	 *  DOM is keyed by `data-word` only. */
	const fineScrollTo = useCallback(
		(wordIdx: number, shouldHighlight: boolean, onReady?: () => void, smooth = false) => {
			if (!listRef.current || !containerRef.current) return undefined;
			const idx = findParagraphIndexForWord(wordIdx);
			const startWord = paragraphStartWords[idx] ?? 0;
			const endWord = paragraphStartWords[idx + 1] ?? Number.POSITIVE_INFINITY;
			return scheduleFineScroll(
				listRef.current,
				containerRef.current,
				wordIdx,
				startWord,
				endWord,
				{
					suppressScrollEnd: suppressNextScrollEndRef,
					suppressHighlight: suppressScrollHighlightClearRef,
				},
				shouldHighlight,
				onReady,
				smooth,
			);
		},
		[findParagraphIndexForWord, paragraphStartWords],
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
			markInitialSettled();
			return;
		}

		const target = initialWord;
		if (target === 0) {
			didInitialScrollRef.current = true;
			markInitialSettled();
			return;
		}

		didInitialScrollRef.current = true;

		const idx = findParagraphIndexForWord(target);
		suppressNextScrollEndRef.current = true;
		suppressScrollHighlightClearRef.current = true;
		listRef.current.scrollToIndex(idx, { align: "start" });
		onInitialActiveOffset(target);

		initialScrollCleanupRef.current =
			fineScrollTo(target, true, () => markInitialSettled()) ?? null;
	}, [
		paragraphs,
		initialWord,
		findParagraphIndexForWord,
		fineScrollTo,
		onInitialActiveOffset,
		markInitialSettled,
	]);

	// ── Imperative jumpTo (chapter / search / highlight-list) ─────────────
	// Visual scroll only: parent has already updated active/progress/last/saved
	// via its jumpToWord wrapper before calling this.
	useImperativeHandle(
		ref,
		() => ({
			jumpTo(wordIdx, { highlight = true, fine = false, smooth = false } = {}) {
				if (!listRef.current) return;
				suppressNextScrollEndRef.current = true;
				if (highlight) suppressScrollHighlightClearRef.current = true;
				if (!fine) {
					const idx = findParagraphIndexForWord(wordIdx);
					listRef.current.scrollToIndex(idx, { align: "start" });
				}
				fineScrollTo(wordIdx, highlight, undefined, smooth);
			},
			scrollBy(pixels) {
				listRef.current?.scrollBy(pixels);
			},
		}),
		[findParagraphIndexForWord, fineScrollTo],
	);

	// ── Scroll handler - hide highlight + update progress bar ──────────────
	const handleScroll = useCallback(
		(scrollOffset: number) => {
			// Cancel any pending long-press - user is scrolling, not selecting
			cancelAnyActiveLongPress();

			// Hide highlight while scrolling. Programmatic jumps keep the
			// highlight via suppressScrollHighlightClearRef. The init-cooldown
			// branch covers VList height-reconciliation micro-scrolls that
			// fire after markInitialSettled clears the suppress flag, which
			// would otherwise wipe the underline ~500ms after open.
			const doneAt = initialScrollDoneAtRef.current;
			const inInitCooldown =
				doneAt !== null && performance.now() - doneAt < INIT_SETTLE_COOLDOWN_MS;
			if (!suppressScrollHighlightClearRef.current && !inInitCooldown) {
				onHighlightClear();
			}
			// Hide progress bar - user is scrolling normally, not scrubbing
			if (!isScrubbingRef.current && !inInitCooldown) onHideProgressBar();
			// Update the progress bar live. findItemIndex maps the current scroll
			// pixel offset to a paragraph index, which we convert to a word offset.
			// Skip during init scroll / cooldown so VList reconciliation micro-scrolls
			// don't flip userMovedRef in the parent and trigger an unmount-flush save.
			if (
				initialSettledRef.current &&
				!inInitCooldown &&
				listRef.current &&
				paragraphStartWords.length > 0
			) {
				const idx = Math.min(
					listRef.current.findItemIndex(scrollOffset),
					paragraphStartWords.length - 1,
				);
				onProgressChange(paragraphStartWords[idx] ?? 0);
			}
			// Re-sync handle positions when scrolling during selection
			if (isSelecting) {
				requestAnimationFrame(() => syncSelectionHandles());
			}
		},
		[
			paragraphStartWords,
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
		if (!initialSettledRef.current) return;
		const doneAt = initialScrollDoneAtRef.current;
		if (doneAt !== null && performance.now() - doneAt < INIT_SETTLE_COOLDOWN_MS) return;
		if (!listRef.current || !containerRef.current) return;

		const cutoffTop = containerRef.current.getBoundingClientRect().top;

		const spans = Array.from(document.querySelectorAll<HTMLElement>("span[data-word]"));
		if (spans.length === 0) return;

		spans.sort((a, b) => {
			const ra = a.getBoundingClientRect();
			const rb = b.getBoundingClientRect();
			return ra.top !== rb.top ? ra.top - rb.top : ra.left - rb.left;
		});

		let bestWord = -1;
		for (const span of spans) {
			if (span.getBoundingClientRect().top >= cutoffTop) {
				const w = Number.parseInt(span.dataset.word ?? "", 10);
				if (Number.isNaN(w) || w < 0) continue;
				bestWord = w;
				break;
			}
		}

		if (bestWord < 0) return;

		onPositionSettle(bestWord);
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
		// still lays out and measures (visibility:hidden can skip that on
		// some engines, which would break findAlignmentSpan). Skeleton is
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
							entries={entriesByParagraph[i] ?? EMPTY_ENTRIES}
							activeWord={activeWord}
							onWordTap={onWordTap}
							onWordLongPress={onWordLongPress}
							onWordMouseDragStart={onWordMouseDragStart}
							highlights={highlightsByParagraph?.get(i)}
							glossaryRanges={glossaryByParagraph?.get(i)}
							links={linksByParagraph?.get(i)}
							selectionRange={selectionRange}
							showActiveWordUnderline={showActiveWordUnderline}
						/>
					))}
					{footer}
				</VList>
			</div>
			{!isInitialScrollReady && (
				<ReaderSkeleton
					style={{
						position: "absolute",
						inset: 0,
						background: "var(--background)",
					}}
				/>
			)}
		</div>
	);
});

export default ScrollView;

export { ReaderSkeleton };
