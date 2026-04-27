import type React from "react";
/**
 * BookReader - full-screen virtualized scroll reader.
 *
 * Data model (lean - see AGENTS.md):
 *   paragraphs[]       string[]   content.split("\n\n"), needed for VList item count
 *   paragraphOffsets[] number[]   byte offset where each paragraph starts in content
 *
 * Per-paragraph word offsets are computed at render time inside <Paragraph>.
 * Only ~20–30 paragraphs are mounted at any time, so this is negligible work.
 *
 * Scroll → position: top-left visible word span (querySelectorAll)      → O(n) n = visible spans
 * Open  → scroll:    binary search paragraphOffsets for book.position   → O(log p)
 * Tap   → position:  data-offset attribute on the <span>                → O(1)
 *
 * Scroll restoration: module-level Map<bookId, CacheSnapshot> so virtua
 * restores pixel-accurate position on repeat visits without any DB storage.
 *
 * Sub-modules:
 *   use-highlight-selection - selection state + handles + edit modal + list modal
 *   use-scrub-progress       - progress-bar pointer gestures
 *   selection-overlay        - JSX for the floating toolbar + drag handles
 */

import {
	IonBackButton,
	IonButton,
	IonButtons,
	IonContent,
	IonHeader,
	IonIcon,
	IonItem,
	IonLabel,
	IonList,
	IonModal,
	IonPage,
	IonSpinner,
	IonTitle,
	IonToolbar,
} from "@ionic/react";
import type { RsvpSettings } from "@lesefluss/rsvp-core";
import { DEFAULT_SETTINGS } from "@lesefluss/rsvp-core";
import { useQueryClient } from "@tanstack/react-query";
import {
	bookmarkOutline,
	flashOffOutline,
	flashOutline,
	listOutline,
	readerOutline,
	searchOutline,
} from "ionicons/icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RouteComponentProps } from "react-router-dom";
import type { VListHandle } from "virtua";
import { VList } from "virtua";
import { useBookSync } from "../../contexts/book-sync-context";
import { useTheme } from "../../contexts/theme-context";
import { useAutoSaveSettings } from "../../hooks/use-auto-save-settings";
import { queryHooks } from "../../services/db/hooks";
import { bookKeys } from "../../services/db/hooks/query-keys";
import { queries } from "../../services/db/queries";
import type { Chapter } from "../../services/db/schema";
import { pushSync, scheduleSyncPush } from "../../services/sync";
import { formatReadingTime } from "../../utils/reading-time";
import AppearancePopover from "./appearance-popover";
import DictionaryModal from "./dictionary-modal";
import HighlightModal from "./highlight-modal";
import HighlightsListModal from "./highlights-list-modal";
import Paragraph, { cancelAnyActiveLongPress, getWordOffsets, utf8ByteLength } from "./paragraph";
import RsvpView from "./rsvp-view";
import SearchModal from "./search-modal";
import SelectionOverlay from "./selection-overlay";
import { useHighlightSelection } from "./use-highlight-selection";
import { useScrubProgress } from "./use-scrub-progress";

// ─── Module-level singletons ─────────────────────────────────────────────────
const _encoder = new TextEncoder();
const _decoder = new TextDecoder();

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

// Sentinel value: no word highlighted (while scrolling)
const NO_HIGHLIGHT = -1;

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

// ─── Main page ───────────────────────────────────────────────────────────────

interface BookReaderProps extends RouteComponentProps<{ id: string }> {}

const BookReader: React.FC<BookReaderProps> = ({ match }) => {
	const id = match.params.id;
	const { pushPosition } = useBookSync();
	const qc = useQueryClient();

	// ── Data queries ──────────────────────────────────────────────────────
	const { data: book, isPending: bookPending } = queryHooks.useBook(id);
	const { data: contentRow, isPending: contentPending } = queryHooks.useBookContent(id);
	const content = contentRow?.content ?? null;
	const { data: highlightRows = [] } = queryHooks.useHighlights(id);

	const { theme } = useTheme();
	const [tocOpen, setTocOpen] = useState(false);
	const [searchOpen, setSearchOpen] = useState(false);
	const [searchInitialQuery, setSearchInitialQuery] = useState<string | undefined>(undefined);
	const [selectedWord, setSelectedWord] = useState<string | null>(null);

	// ── RSVP mode ─────────────────────────────────────────────────────────
	const [readerMode, setReaderMode] = useState<"scroll" | "rsvp">("scroll");

	// The byte offset we consider "current" - used for word highlight + saves
	const [activeOffset, setActiveOffset] = useState(0);
	// Tracks position for the progress bar - updated during scroll (activeOffset
	// is set to NO_HIGHLIGHT=-1 while scrolling, so can't be used for progress).
	const [progressOffset, setProgressOffset] = useState(0);
	// Separate state for RsvpView's initialByteOffset - only updated on genuine
	// user seeks (entering RSVP mode, scrubbing). NOT updated from onPositionChange
	// callbacks, which would echo back and cause the scrub effect to pause playback.
	const [rsvpInitOffset, setRsvpInitOffset] = useState(0);

	// Progress bar visibility - shown on tap/word-tap, hidden when user scrolls
	const [progressBarVisible, setProgressBarVisible] = useState(false);

	// Keeps the skeleton visible until the initial fine-scroll has landed, so the
	// user never sees VList reconcile heights mid-scroll. Flipped by onReady from
	// scheduleFineScroll. Only applies to the first open (jumps use the VList live).
	const [isInitialScrollReady, setIsInitialScrollReady] = useState(false);

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

	// Track the last offset we set so we can flush on unmount.
	// null = not yet loaded from DB, don't overwrite on unmount.
	const lastOffsetRef = useRef<number | null>(null);

	// Guards the seed effect below so it only runs once on initial load.
	// book is a new object reference on every BLE position sync (query
	// invalidation), so without this guard setRsvpInitOffset would fire
	// mid-playback and pause the RSVP reader.
	const didSeedOffsetsRef = useRef(false);

	const didSeedModeRef = useRef(false);

	// Reset all "has-happened-once" guards when the user navigates to a different
	// book. The route reuses this component, so without this the skeleton stays
	// hidden on the second book's open and the seed/initial-scroll effects
	// don't re-run.
	// MUST be declared BEFORE the seed effect: on first mount both effects fire
	// in declaration order, so if reset ran after seed it would null out
	// lastOffsetRef right after seed populated it — then a fast RSVP toggle
	// (before the initial scroll-end repopulates it) would read null, fall
	// back to 0, and overwrite the book's saved position with 0.
	useEffect(() => {
		setIsInitialScrollReady(false);
		didInitialScrollRef.current = false;
		didSeedOffsetsRef.current = false;
		didSeedModeRef.current = false;
		lastOffsetRef.current = null;
	}, [id]);

	// ── Seed activeOffset + lastOffsetRef once book loads ─────────────────
	useEffect(() => {
		if (book && !didSeedOffsetsRef.current) {
			didSeedOffsetsRef.current = true;
			setActiveOffset(book.position);
			setProgressOffset(book.position);
			setRsvpInitOffset(book.position);
			lastOffsetRef.current = book.position;
		}
	}, [book]);

	// ── Build paragraph index ──────────────────────────────────────────────
	// Computed once per content load. Two cheap structures:
	//   paragraphs[i]       - the text of paragraph i
	//   paragraphOffsets[i] - UTF-8 byte offset of paragraph i's first character
	//
	// We must use UTF-8 byte lengths (not JS .length) because the ESP32 tracks
	// position as a byte offset into book.txt. For any multi-byte character
	// (smart quotes, em-dashes, accented letters) the two diverge.
	const { paragraphs, paragraphOffsets } = useMemo(() => {
		if (!content) return { paragraphs: [], paragraphOffsets: [] };

		const paras = content.split("\n\n");
		const offsets: number[] = new Array(paras.length);
		let offset = 0;
		for (let i = 0; i < paras.length; i++) {
			offsets[i] = offset;
			offset += utf8ByteLength(paras[i]) + 2; // +2 for the "\n\n" separator (always 2 UTF-8 bytes)
		}
		return { paragraphs: paras, paragraphOffsets: offsets };
	}, [content]);

	// ── Parse chapters ────────────────────────────────────────────────────
	const chapters = useMemo<Chapter[]>(() => {
		if (!contentRow?.chapters) return [];
		try {
			return JSON.parse(contentRow.chapters) as Chapter[];
		} catch {
			return [];
		}
	}, [contentRow?.chapters]);

	// ── Reading time estimation ───────────────────────────────────────────
	const contentBytes = useMemo(() => (content ? _encoder.encode(content) : null), [content]);

	const totalWordCount = useMemo(() => content?.match(/\S+/g)?.length ?? 0, [content]);

	const chapterWordCounts = useMemo(() => {
		if (!chapters.length || !contentBytes) return [];
		return chapters.map((ch, i) => {
			const end = chapters[i + 1]?.startByte ?? contentBytes.length;
			const text = _decoder.decode(contentBytes.subarray(ch.startByte, end));
			return text.match(/\S+/g)?.length ?? 0;
		});
	}, [chapters, contentBytes]);

	const currentChapterIndex = useMemo(() => {
		if (!chapters.length) return -1;
		for (let i = chapters.length - 1; i >= 0; i--) {
			if (progressOffset >= chapters[i].startByte) return i;
		}
		return 0;
	}, [progressOffset, chapters]);

	// ── Settings (RSVP + reader appearance) ──────────────────────────────
	const { data: dbSettings } = queryHooks.useSettings();
	const { updateSetting } = useAutoSaveSettings();

	// ── Apply default reader mode once settings + book are loaded ─────────
	// Runs once; subsequent settings changes don't flip the user's in-session mode.
	useEffect(() => {
		if (!didSeedModeRef.current && dbSettings && book) {
			didSeedModeRef.current = true;
			if (dbSettings.defaultReaderMode === "rsvp") {
				setReaderMode("rsvp");
				setProgressBarVisible(true);
			}
		}
	}, [dbSettings, book]);

	const readerFontSize = dbSettings?.readerFontSize ?? DEFAULT_SETTINGS.READER_FONT_SIZE;
	const readerFontFamily = dbSettings?.readerFontFamily ?? DEFAULT_SETTINGS.READER_FONT_FAMILY;
	const readerLineSpacing = dbSettings?.readerLineSpacing ?? DEFAULT_SETTINGS.READER_LINE_SPACING;
	const readerMargin = dbSettings?.readerMargin ?? DEFAULT_SETTINGS.READER_MARGIN;
	const readerActiveWordUnderline =
		dbSettings?.readerActiveWordUnderline ?? DEFAULT_SETTINGS.READER_ACTIVE_WORD_UNDERLINE;

	const rsvpSettings = useMemo<RsvpSettings>(
		() => ({
			wpm: dbSettings?.wpm ?? DEFAULT_SETTINGS.WPM,
			delayComma: dbSettings?.delayComma ?? DEFAULT_SETTINGS.DELAY_COMMA,
			delayPeriod: dbSettings?.delayPeriod ?? DEFAULT_SETTINGS.DELAY_PERIOD,
			accelStart: dbSettings?.accelStart ?? DEFAULT_SETTINGS.ACCEL_START,
			accelRate: dbSettings?.accelRate ?? DEFAULT_SETTINGS.ACCEL_RATE,
			xOffset: dbSettings?.xOffset ?? DEFAULT_SETTINGS.X_OFFSET,
		}),
		[dbSettings],
	);

	// ── Save position to DB + BLE ─────────────────────────────────────────
	// Fire-and-forget writes - no mutation wrapper needed for high-frequency saves.
	const savePosition = useCallback(
		async (offset: number, { scheduleSync = true }: { scheduleSync?: boolean } = {}) => {
			await queries.updateBook(id, { position: offset, lastRead: Date.now() });
			await pushPosition(offset);
			if (scheduleSync) scheduleSyncPush(5000);
		},
		[id, pushPosition],
	);

	// ── Shared helpers ────────────────────────────────────────────────────
	/** Binary search: find the last paragraph index whose offset ≤ targetByte. */
	const findParagraphIndex = useCallback(
		(targetByte: number): number => {
			let lo = 0;
			let hi = paragraphOffsets.length - 1;
			while (lo < hi) {
				const mid = Math.ceil((lo + hi) / 2);
				if (paragraphOffsets[mid] <= targetByte) lo = mid;
				else hi = mid - 1;
			}
			return lo;
		},
		[paragraphOffsets],
	);

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

	/** Scroll to a byte offset, update highlight + progress, and persist.
	 *  After the paragraph scrolls into view, fine-tunes to the exact word
	 *  span so the matched word lands at the top of the viewport. */
	const jumpToOffset = useCallback(
		(byteOffset: number, { highlight = true }: { highlight?: boolean } = {}) => {
			if (!listRef.current) return;
			const idx = findParagraphIndex(byteOffset);
			suppressNextScrollEndRef.current = true;
			if (highlight) suppressScrollHighlightClearRef.current = true;
			listRef.current.scrollToIndex(idx, { align: "start" });
			setActiveOffset(byteOffset);
			setProgressOffset(byteOffset);
			lastOffsetRef.current = byteOffset;
			savePosition(byteOffset);
			fineScrollTo(byteOffset, highlight);
		},
		[findParagraphIndex, savePosition, fineScrollTo],
	);

	// ── Highlight / selection state ──────────────────────────────────────
	const sel = useHighlightSelection({
		bookId: id,
		contentBytes,
		highlightRows,
		paragraphOffsets,
	});

	// ── Progress-bar scrub gestures ───────────────────────────────────────
	const scrub = useScrubProgress({
		book,
		readerMode,
		paragraphOffsets,
		findParagraphIndex,
		jumpToOffset,
		savePosition,
		lastOffsetRef,
		setProgressOffset,
		setRsvpInitOffset,
		setProgressBarVisible,
	});

	// ── Initial scroll to saved position ──────────────────────────────────
	// Also re-runs when readerMode changes to "scroll" (returning from RSVP).
	useEffect(() => {
		if (didInitialScrollRef.current) return;
		// RSVP mode renders a different view, so skeleton/ready isn't relevant there.
		if (readerMode !== "scroll") return;
		// Wait for refs + data. If content is loaded but paragraph list is empty
		// (malformed book), reveal the empty reader rather than staying hidden.
		if (!listRef.current || !book) return;
		if (paragraphs.length === 0) {
			// Terminal: mark initial scroll done so a later paragraphs update
			// doesn't re-enter this effect and jerk an already-revealed reader.
			didInitialScrollRef.current = true;
			setIsInitialScrollReady(true);
			return;
		}

		didInitialScrollRef.current = true;

		// Use lastOffsetRef if available (e.g. returning from RSVP mode),
		// otherwise fall back to the DB-stored position.
		const target = lastOffsetRef.current ?? book.position;
		if (target === 0) {
			// start of book - default scroll is correct, nothing to wait for
			setIsInitialScrollReady(true);
			return;
		}

		const idx = findParagraphIndex(target);
		suppressNextScrollEndRef.current = true;
		suppressScrollHighlightClearRef.current = true;
		listRef.current.scrollToIndex(idx, { align: "start" });
		setActiveOffset(target);

		return fineScrollTo(target, true, () => setIsInitialScrollReady(true));
	}, [readerMode, paragraphs, book, findParagraphIndex, fineScrollTo]);

	// ── Scroll handler - hide highlight + update progress bar ──────────────
	const { isSelecting, syncHandlesRef } = sel;
	const { isScrubbingRef } = scrub;
	const handleScroll = useCallback(
		(scrollOffset: number) => {
			// Cancel any pending long-press - user is scrolling, not selecting
			cancelAnyActiveLongPress();

			// Hide highlight while scrolling (skip if already hidden to avoid re-renders).
			// After a programmatic jump (search/chapter) we keep the highlight.
			if (!suppressScrollHighlightClearRef.current) {
				setActiveOffset((prev) => (prev === NO_HIGHLIGHT ? prev : NO_HIGHLIGHT));
			}
			// Hide progress bar - user is scrolling normally, not scrubbing
			if (!isScrubbingRef.current) setProgressBarVisible(false);
			// Update the progress bar live. findItemIndex maps the current scroll
			// pixel offset to a paragraph index, which we convert to a byte offset.
			if (listRef.current && paragraphOffsets.length > 0) {
				const idx = Math.min(
					listRef.current.findItemIndex(scrollOffset),
					paragraphOffsets.length - 1,
				);
				setProgressOffset(paragraphOffsets[idx] ?? 0);
			}
			// Re-sync handle positions when scrolling during selection
			if (isSelecting) {
				requestAnimationFrame(() => syncHandlesRef.current());
			}
		},
		[paragraphOffsets, isSelecting, syncHandlesRef, isScrubbingRef],
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

		setActiveOffset(bestOffset);
		setProgressOffset(bestOffset);
		lastOffsetRef.current = bestOffset;
		savePosition(bestOffset);
	}, [savePosition]);

	// ── Word tap handler ───────────────────────────────────────────────────
	// During selection mode: tapping anywhere cancels the selection (user
	// adjusts range via handles, not word taps).
	// Normal mode - first tap: set position (highlight it).
	// Normal mode - second tap on highlighted word: open highlight modal (if highlighted)
	//   or dictionary (if not highlighted).
	const { cancelSelection, findHighlightAt, openHighlightEditor } = sel;
	const handleWordTap = useCallback(
		(offset: number, wordText: string) => {
			if (isSelecting) {
				// Any tap outside the handle drag system cancels the selection
				cancelSelection();
				return;
			}

			if (offset === activeOffset) {
				// Second tap on the highlighted word
				const existing = findHighlightAt(offset);
				if (existing) {
					openHighlightEditor(existing);
				} else {
					// No existing highlight - open dictionary instead
					const clean = wordText.replace(/[^a-zA-Z'-]/g, "").toLowerCase();
					if (clean) setSelectedWord(clean);
				}
				return;
			}
			setActiveOffset(offset);
			setProgressOffset(offset);
			setProgressBarVisible(true);
			lastOffsetRef.current = offset;
			savePosition(offset);
		},
		[
			savePosition,
			activeOffset,
			isSelecting,
			cancelSelection,
			findHighlightAt,
			openHighlightEditor,
		],
	);

	// ── Mouse drag-to-select ──────────────────────────────────────────────
	// Desktop equivalent of long-press: pointerdown on a word + mousemove > 8px
	// starts selection mode. We then track the mouse across word spans until
	// mouseup to extend the selection range. The synthetic click that follows
	// mouseup is swallowed so it doesn't cancel the fresh selection via
	// handleWordTap.
	const { startSelection, extendSelectionTo, startHandleRef, endHandleRef } = sel;
	const handleWordMouseDragStart = useCallback(
		(offset: number, initialEvent: PointerEvent) => {
			// If the word is already highlighted, treat like long-press - open editor.
			const existing = findHighlightAt(offset);
			if (existing) {
				openHighlightEditor(existing);
				return;
			}
			startSelection(offset);
			// Make the selection handles transparent to elementFromPoint during the
			// drag - once they pop up they can intercept the cursor and break the
			// word-under-cursor lookup. Restored on cleanup.
			const prevStartPe = startHandleRef.current?.style.pointerEvents ?? "";
			const prevEndPe = endHandleRef.current?.style.pointerEvents ?? "";
			if (startHandleRef.current) startHandleRef.current.style.pointerEvents = "none";
			if (endHandleRef.current) endHandleRef.current.style.pointerEvents = "none";

			// Extend the cursor's current position (the drag has already moved > 8px
			// past the start word by the time we get here - without this the initial
			// selection is just the start word until the next pointermove fires).
			const extendToPoint = (clientX: number, clientY: number) => {
				const el = document.elementFromPoint(clientX, clientY);
				const span = el?.closest<HTMLElement>("span[data-offset]");
				if (!span) return;
				const wordOffset = Number.parseInt(span.dataset.offset ?? "", 10);
				if (Number.isNaN(wordOffset)) return;
				extendSelectionTo(wordOffset);
			};
			extendToPoint(initialEvent.clientX, initialEvent.clientY);

			const onMove = (me: PointerEvent) => extendToPoint(me.clientX, me.clientY);
			const cleanup = () => {
				if (startHandleRef.current) startHandleRef.current.style.pointerEvents = prevStartPe;
				if (endHandleRef.current) endHandleRef.current.style.pointerEvents = prevEndPe;
				window.removeEventListener("pointermove", onMove);
				window.removeEventListener("pointerup", onEnd);
				window.removeEventListener("pointercancel", cleanup);
			};
			const onEnd = (ue: PointerEvent) => {
				// Final extend so the release point is captured even if pointermove
				// didn't fire between the last move and pointerup.
				extendToPoint(ue.clientX, ue.clientY);
				cleanup();
				// Swallow the next click event so it doesn't fire on the word under the
				// release point (which would call handleWordTap → cancelSelection).
				const swallow = (ce: MouseEvent) => {
					ce.stopPropagation();
					ce.preventDefault();
				};
				window.addEventListener("click", swallow, { once: true, capture: true });
			};
			window.addEventListener("pointermove", onMove);
			window.addEventListener("pointerup", onEnd);
			window.addEventListener("pointercancel", cleanup);
		},
		[
			findHighlightAt,
			openHighlightEditor,
			startSelection,
			extendSelectionTo,
			startHandleRef,
			endHandleRef,
		],
	);

	// ── RSVP helpers ─────────────────────────────────────────────────────

	const handleRsvpPositionChange = useCallback(
		(byteOffset: number) => {
			setProgressOffset(byteOffset);
			lastOffsetRef.current = byteOffset;
			savePosition(byteOffset, { scheduleSync: false });
		},
		[savePosition],
	);

	/** Switch from RSVP to scroll mode, positioning VList at the given byte offset. */
	const exitRsvpToScroll = useCallback(
		(byteOffset: number) => {
			lastOffsetRef.current = byteOffset;
			setProgressOffset(byteOffset);
			didInitialScrollRef.current = false;
			setReaderMode("scroll");
			savePosition(byteOffset);
		},
		[id, savePosition],
	);

	const handleRsvpToggle = useCallback(() => {
		if (readerMode === "scroll") {
			// Use lastOffsetRef (word-level accurate from handleScrollEnd)
			// instead of progressOffset (paragraph-level from handleScroll).
			const offset = lastOffsetRef.current ?? 0;
			setProgressOffset(offset);
			setRsvpInitOffset(offset);
			setReaderMode("rsvp");
			setProgressBarVisible(true);
		} else {
			exitRsvpToScroll(lastOffsetRef.current ?? 0);
		}
	}, [readerMode, exitRsvpToScroll]);

	const handleRsvpFinished = useCallback(() => {
		exitRsvpToScroll(lastOffsetRef.current ?? 0);
	}, [exitRsvpToScroll]);

	const handleRsvpWpmChange = useCallback(
		(wpm: number) => updateSetting("wpm", wpm),
		[updateSetting],
	);

	// ── Chapter jump ──────────────────────────────────────────────────────
	const handleChapterJump = useCallback(
		(startByte: number) => {
			if (readerMode === "rsvp") {
				exitRsvpToScroll(startByte);
			} else {
				jumpToOffset(startByte);
			}
			setTocOpen(false);
		},
		[readerMode, jumpToOffset, exitRsvpToScroll],
	);

	// ── Search jump ───────────────────────────────────────────────────────────
	// The search modal gives us a JS char offset (indexOf result). We convert
	// it to a UTF-8 byte offset, then snap to the nearest word so the matched
	// word gets highlighted.
	const handleSearchJump = useCallback(
		(charOffset: number) => {
			if (!content) return;
			const byteOffset = utf8ByteLength(content.slice(0, charOffset));

			// Find the exact word offset within the paragraph so the matched
			// word gets highlighted (not just the paragraph start).
			const paraIdx = findParagraphIndex(byteOffset);
			const paraText = paragraphs[paraIdx] ?? "";
			const paraStart = paragraphOffsets[paraIdx] ?? 0;
			const wordOffsets = getWordOffsets(paraText, paraStart);
			let wordByte = paraStart;
			for (const wo of wordOffsets) {
				if (wo <= byteOffset) wordByte = wo;
				else break;
			}

			if (readerMode === "rsvp") {
				setActiveOffset(wordByte);
				exitRsvpToScroll(wordByte);
			} else {
				jumpToOffset(wordByte);
			}
		},
		[
			content,
			paragraphs,
			paragraphOffsets,
			readerMode,
			findParagraphIndex,
			jumpToOffset,
			exitRsvpToScroll,
		],
	);

	// ── Show progress bar on any tap in the reading area ─────────────────
	// Native listener needed because VList's internal scroll container doesn't
	// propagate clicks through React's synthetic event system.
	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const show = () => setProgressBarVisible(true);
		el.addEventListener("click", show);
		return () => el.removeEventListener("click", show);
	}, []);

	// ── Hide tab bar while reader is mounted ──────────────────────────────
	// Ionic's shadow DOM toggles tab-bar-hidden on keyboard show/hide, and
	// external CSS can't override :host styles reliably. A body class lets
	// us target ion-tab-bar from outside the shadow DOM with higher priority.
	useEffect(() => {
		document.body.classList.add("reader-open");
		return () => {
			document.body.classList.remove("reader-open");
		};
	}, []);

	// touch-action: none is applied directly to the handle elements via CSS
	// so the VList container remains scrollable during selection mode.

	// ── Flush position on unmount ─────────────────────────────────────────
	useEffect(() => {
		return () => {
			// Flush position to DB so the library shows updated progress.
			// Only write if we actually loaded the book (lastOffsetRef !== null).
			const offset = lastOffsetRef.current;
			if (offset !== null) {
				savePosition(offset, { scheduleSync: false });
				pushSync().catch(() => {});
			}
			// Invalidate the books list so the library grid picks up the new position
			// when the user navigates back.
			qc.invalidateQueries({ queryKey: bookKeys.all });
		};
	}, [qc, savePosition]);

	// ─── Render ─────────────────────────────────────────────────────────────

	if (bookPending) {
		return (
			<IonPage>
				<IonContent className="ion-text-center no-header-content">
					<div
						style={{
							display: "flex",
							height: "100%",
							alignItems: "center",
							justifyContent: "center",
						}}
					>
						<IonSpinner />
					</div>
				</IonContent>
			</IonPage>
		);
	}

	if (!book) {
		return (
			<IonPage>
				<IonHeader class="ion-no-border">
					<IonToolbar>
						<IonButtons slot="start">
							<IonBackButton defaultHref="/tabs/library" />
						</IonButtons>
					</IonToolbar>
				</IonHeader>
				<IonContent className="ion-padding ion-text-center">
					<p>Book not found.</p>
				</IonContent>
			</IonPage>
		);
	}

	const progressPct = book.size > 0 ? Math.min(100, (progressOffset / book.size) * 100) : 0;

	const showReadingTime = dbSettings?.showReadingTime ?? DEFAULT_SETTINGS.SHOW_READING_TIME;
	const estimateWpm = readerMode === "rsvp" ? rsvpSettings.wpm : 250;
	const bookMinutesRemaining =
		showReadingTime && totalWordCount > 0
			? (totalWordCount * (1 - progressPct / 100)) / estimateWpm
			: 0;
	let chapterMinutesRemaining: number | null = null;
	if (showReadingTime && currentChapterIndex >= 0 && contentBytes) {
		const ch = chapters[currentChapterIndex];
		const chapterEnd = chapters[currentChapterIndex + 1]?.startByte ?? contentBytes.length;
		const chapterProgress =
			chapterEnd > ch.startByte
				? Math.max(0, (progressOffset - ch.startByte) / (chapterEnd - ch.startByte))
				: 0;
		chapterMinutesRemaining =
			(chapterWordCounts[currentChapterIndex] * (1 - chapterProgress)) / estimateWpm;
	}

	return (
		<IonPage className={`reader-theme-${theme}`}>
			<IonHeader class="ion-no-border">
				<IonToolbar>
					<IonButtons slot="start">
						<IonBackButton defaultHref="/tabs/library" />
					</IonButtons>
					<IonTitle>{book.title}</IonTitle>
					<IonButtons slot="end">
						<IonButton
							onClick={handleRsvpToggle}
							disabled={!content}
							aria-label={
								readerMode === "rsvp" ? "Switch to scroll reader" : "Switch to RSVP reader"
							}
							className={readerMode === "rsvp" ? "rsvp-toggle-active" : undefined}
						>
							<IonIcon
								slot="icon-only"
								icon={readerMode === "rsvp" ? flashOffOutline : flashOutline}
							/>
						</IonButton>
						<IonButton
							onClick={() => setSearchOpen(true)}
							disabled={!content}
							aria-label="Search content"
						>
							<IonIcon slot="icon-only" icon={searchOutline} />
						</IonButton>
						{chapters.length > 0 && (
							<IonButton onClick={() => setTocOpen(true)} aria-label="Table of contents">
								<IonIcon slot="icon-only" icon={listOutline} />
							</IonButton>
						)}
						{highlightRows.length > 0 && (
							<IonButton
								onClick={() => sel.setHighlightsListOpen(true)}
								aria-label="View highlights"
							>
								<IonIcon slot="icon-only" icon={bookmarkOutline} />
							</IonButton>
						)}
						<IonButton id="appearance-trigger" aria-label="Appearance settings">
							<IonIcon slot="icon-only" icon={readerOutline} />
						</IonButton>
					</IonButtons>
				</IonToolbar>
			</IonHeader>

			<IonContent scrollY={false}>
				{contentPending || !content ? (
					<ReaderSkeleton />
				) : readerMode === "scroll" ? (
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
									"--reader-line-height": String(readerLineSpacing),
								} as React.CSSProperties
							}
						>
							<VList
								ref={listRef}
								style={{
									height: "100%",
									padding: `0 ${readerMargin}px`,
									paddingBottom: "calc(52px + env(safe-area-inset-bottom, 0px))",
									fontSize: `${readerFontSize}px`,
									fontFamily:
										readerFontFamily === "serif" ? "Georgia, 'Times New Roman', serif" : undefined,
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
										onWordTap={handleWordTap}
										onWordLongPress={sel.handleWordLongPress}
										onWordMouseDragStart={handleWordMouseDragStart}
										highlights={sel.highlightsByParagraph.get(i)}
										selectionRange={sel.selectionRange}
										showActiveWordUnderline={readerActiveWordUnderline}
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
				) : (
					<RsvpView
						content={content}
						initialByteOffset={rsvpInitOffset}
						settings={rsvpSettings}
						fontSize={readerFontSize}
						onPositionChange={handleRsvpPositionChange}
						onFinished={handleRsvpFinished}
						onWpmChange={handleRsvpWpmChange}
						onLookup={setSelectedWord}
					/>
				)}

				{/* ── Progress bar ── */}
				{(progressBarVisible || readerMode === "rsvp") && (
					// biome-ignore lint/a11y/useFocusableInteractive: scrubber
					<div
						ref={scrub.progressBarRef}
						className="reader-progress-bar"
						onPointerDown={scrub.handleProgressPointerDown}
						onPointerMove={scrub.handleProgressPointerMove}
						onPointerUp={scrub.handleProgressPointerUp}
						aria-label="Reading progress"
						role="slider"
						aria-valuenow={Math.round(progressPct)}
						aria-valuemin={0}
						aria-valuemax={100}
					>
						<div className="reader-progress-fill-track">
							<div className="reader-progress-fill" style={{ width: `${progressPct}%` }} />
						</div>
						<div className="reader-progress-label">
							<span>
								{Math.round(progressPct)}%
								{bookMinutesRemaining > 0 && <> · {formatReadingTime(bookMinutesRemaining)} left</>}
							</span>
							{chapterMinutesRemaining != null && currentChapterIndex >= 0 && (
								<span className="reader-progress-chapter-time">
									{chapters[currentChapterIndex].title} ·{" "}
									{formatReadingTime(chapterMinutesRemaining)} left
								</span>
							)}
						</div>
					</div>
				)}
			</IonContent>

			{/* ── Selection toolbar + handles (fixed position, sync'd by hook) ── */}
			<SelectionOverlay
				isSelecting={sel.isSelecting}
				selectionColor={sel.selectionColor}
				toolbarRef={sel.toolbarRef}
				startHandleRef={sel.startHandleRef}
				endHandleRef={sel.endHandleRef}
				onColorChange={sel.handleSelectionColorChange}
				onNote={() => sel.setNoteInputOpen(true)}
				onCancel={sel.cancelSelection}
				onStartHandlePointerDown={sel.handleStartHandlePointerDown}
				onEndHandlePointerDown={sel.handleEndHandlePointerDown}
			/>

			{/* ── Appearance popover ── */}
			<AppearancePopover trigger="appearance-trigger" />

			{/* ── TOC modal ── */}
			<IonModal
				isOpen={tocOpen}
				onDidDismiss={() => setTocOpen(false)}
				breakpoints={[0, 0.5, 0.9]}
				initialBreakpoint={0.5}
				className={["rsvp-toc-modal", `reader-theme-${theme}`].join(" ")}
			>
				<IonHeader>
					<IonToolbar>
						<IonTitle>Contents</IonTitle>
						<IonButtons slot="end">
							<IonButton onClick={() => setTocOpen(false)}>Close</IonButton>
						</IonButtons>
					</IonToolbar>
				</IonHeader>
				<IonContent>
					<IonList>
						{chapters.map((ch, i) => (
							<IonItem
								key={i.toString()}
								button
								detail={false}
								onClick={() => handleChapterJump(ch.startByte)}
							>
								<IonLabel>{ch.title}</IonLabel>
							</IonItem>
						))}
					</IonList>
				</IonContent>
			</IonModal>

			{/* ── Search modal ── */}
			<SearchModal
				isOpen={searchOpen}
				onClose={() => {
					setSearchOpen(false);
					setSearchInitialQuery(undefined);
				}}
				content={content ?? ""}
				onJump={handleSearchJump}
				theme={theme}
				initialQuery={searchInitialQuery}
			/>

			{/* ── Dictionary modal ── */}
			<DictionaryModal
				word={selectedWord}
				onClose={() => setSelectedWord(null)}
				onSearch={(w) => {
					setSelectedWord(null);
					setSearchInitialQuery(w);
					setSearchOpen(true);
				}}
				theme={theme}
			/>

			{/* ── Highlight edit modal ── */}
			<HighlightModal
				highlight={sel.editingHighlight}
				highlightText={sel.editingHighlightText}
				onClose={() => sel.setEditingHighlight(null)}
				onSave={sel.handleHighlightSave}
				onDelete={sel.handleHighlightDelete}
				theme={theme}
			/>

			{/* ── Highlights list modal ── */}
			<HighlightsListModal
				isOpen={sel.highlightsListOpen}
				highlights={highlightRows}
				content={content ?? ""}
				onClose={() => sel.setHighlightsListOpen(false)}
				onJump={jumpToOffset}
				theme={theme}
			/>

			{/* ── Note input modal (during selection) ── */}
			<IonModal
				isOpen={sel.noteInputOpen}
				onDidDismiss={sel.handleSelectionNoteDone}
				breakpoints={[0, 0.4]}
				initialBreakpoint={0.4}
				className={["rsvp-highlight-modal", `reader-theme-${theme}`].join(" ")}
			>
				<IonHeader>
					<IonToolbar>
						<IonTitle>Add Note</IonTitle>
						<IonButtons slot="end">
							<IonButton onClick={sel.handleSelectionNoteDone} strong>
								Done
							</IonButton>
						</IonButtons>
					</IonToolbar>
				</IonHeader>
				<IonContent className="ion-padding">
					<textarea
						className="highlight-note-textarea"
						value={sel.pendingNote}
						onChange={(e) => sel.setPendingNote(e.target.value)}
						placeholder="Add a note to this highlight…"
						rows={4}
						// biome-ignore lint/a11y/noAutofocus: intentional focus for note input
						autoFocus
					/>
				</IonContent>
			</IonModal>
		</IonPage>
	);
};

export default BookReader;
