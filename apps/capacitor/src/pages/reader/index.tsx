import type React from "react";
/**
 * BookReader — full-screen virtualized scroll reader.
 *
 * Data model (lean — see AGENTS.md):
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
import { useQueryClient } from "@tanstack/react-query";
import {
	bookmarkOutline,
	flashOffOutline,
	flashOutline,
	listOutline,
	readerOutline,
	searchOutline,
} from "ionicons/icons";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RouteComponentProps } from "react-router-dom";
import type { CacheSnapshot, VListHandle } from "virtua";
import { VList } from "virtua";
import { useBookSync } from "../../contexts/book-sync-context";
import { useTheme } from "../../contexts/theme-context";
import { queryHooks } from "../../services/db/hooks";
import { bookKeys } from "../../services/db/hooks/query-keys";
import { queries } from "../../services/db/queries";
import type { Chapter, Highlight } from "../../services/db/schema";
import { DEFAULT_SETTINGS } from "../../utils/settings";
import { formatReadingTime } from "../../utils/reading-time";
import AppearancePopover from "./appearance-popover";
import DictionaryModal from "./dictionary-modal";
import HighlightModal from "./highlight-modal";
import HighlightsListModal from "./highlights-list-modal";
import Paragraph, { cancelAnyActiveLongPress, getWordOffsets, type HighlightRange, utf8ByteLength } from "./paragraph";
import type { RsvpSettings } from "./rsvp-engine";
import RsvpView from "./rsvp-view";
import SearchModal from "./search-modal";
import SelectionToolbar, { type HighlightColor } from "./selection-toolbar";

// ─── Module-level singletons ─────────────────────────────────────────────────
const scrollCache = new Map<string, CacheSnapshot>();
const _encoder = new TextEncoder();
const _decoder = new TextDecoder();

// Sentinel value: no word highlighted (while scrolling)
const NO_HIGHLIGHT = -1;

// ─── Random hex id ───────────────────────────────────────────────────────────
function randomHexId(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(4)))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

// Must match .selection-toolbar height in monochrome.css
const SELECTION_TOOLBAR_H = 48;
// Must match .selection-handle width and padding in monochrome.css
const HANDLE_WIDTH = 44;
const HANDLE_V_PAD = 10;
const HANDLE_H_HALF = HANDLE_WIDTH / 2;

// ─── Skeleton loading lines ──────────────────────────────────────────────────
const skeletonLines = Array.from({ length: 40 }, (_, i) => ({
	width: `${60 + ((i * 17) % 35)}%`,
	marginBottom: i % 4 === 3 ? "20px" : "10px",
}));

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

	// ── Highlight mutations ───────────────────────────────────────────────
	const addHighlightMutation = queryHooks.useAddHighlight();
	const updateHighlightMutation = queryHooks.useUpdateHighlight();
	const deleteHighlightMutation = queryHooks.useDeleteHighlight();

	const { theme } = useTheme();
	const [tocOpen, setTocOpen] = useState(false);
	const [searchOpen, setSearchOpen] = useState(false);
	const [searchInitialQuery, setSearchInitialQuery] = useState<string | undefined>(undefined);
	const [selectedWord, setSelectedWord] = useState<string | null>(null);
	const [highlightsListOpen, setHighlightsListOpen] = useState(false);

	// ── Highlight modal (edit existing highlight) ─────────────────────────
	const [editingHighlight, setEditingHighlight] = useState<Highlight | null>(null);
	const [editingHighlightText, setEditingHighlightText] = useState("");

	// ── Selection state ───────────────────────────────────────────────────
	// selectionAnchor: byte offset of the word where long-press started (null = not selecting)
	// selectionEnd: byte offset of the current drag end
	// selectionColor: null = no color picked yet (nothing auto-saved yet)
	const [selectionAnchor, setSelectionAnchor] = useState<number | null>(null);
	// Derived: true while a selection is active (selectionAnchor is always set/cleared with mode entry/exit)
	const isSelecting = selectionAnchor !== null;
	const [selectionEnd, setSelectionEnd] = useState<number | null>(null);
	const [selectionColor, setSelectionColor] = useState<HighlightColor | null>(null);
	// ID of the highlight that was auto-saved when the user first picked a color.
	// null = not yet saved (user is still positioning handles).
	const [selectionSavedId, setSelectionSavedId] = useState<string | null>(null);
	const [pendingNote, setPendingNote] = useState("");
	const [noteInputOpen, setNoteInputOpen] = useState(false);

	// Keep refs in sync with state so event handlers can read current values without stale closures
	useEffect(() => {
		selectionAnchorRef.current = selectionAnchor;
	}, [selectionAnchor]);
	useEffect(() => {
		selectionEndRef.current = selectionEnd;
	}, [selectionEnd]);

	// Derived: the active selection range (start <= end, both defined)
	const selectionRange = useMemo(() => {
		if (selectionAnchor === null || selectionEnd === null) return null;
		return {
			start: Math.min(selectionAnchor, selectionEnd),
			end: Math.max(selectionAnchor, selectionEnd),
		};
	}, [selectionAnchor, selectionEnd]);

	// ── RSVP mode ─────────────────────────────────────────────────────────
	const [readerMode, setReaderMode] = useState<"scroll" | "rsvp">("scroll");

	// The byte offset we consider "current" — used for word highlight + saves
	const [activeOffset, setActiveOffset] = useState(0);
	// Tracks position for the progress bar — updated during scroll (activeOffset
	// is set to NO_HIGHLIGHT=-1 while scrolling, so can't be used for progress).
	const [progressOffset, setProgressOffset] = useState(0);

	// Progress bar visibility — shown on tap/word-tap, hidden when user scrolls
	const [progressBarVisible, setProgressBarVisible] = useState(false);
	const isScrubbingRef = useRef(false);

	const listRef = useRef<VListHandle>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const startHandleRef = useRef<HTMLDivElement>(null);
	const endHandleRef = useRef<HTMLDivElement>(null);
	const toolbarRef = useRef<HTMLDivElement>(null);
	// Refs keep current selection values accessible inside non-reactive event handlers
	const selectionAnchorRef = useRef<number | null>(null);
	const selectionEndRef = useRef<number | null>(null);

	// Whether the initial scroll-to-position has happened
	const didInitialScrollRef = useRef(false);

	// Suppresses the handleScrollEnd that fires after the programmatic
	// scrollToIndex on first render — prevents overwriting the precise
	// saved position with whatever word happens to be at the top.
	const suppressNextScrollEndRef = useRef(false);

	// Suppresses handleScroll from clearing activeOffset after a
	// programmatic jump (search, chapter). Without this the scroll
	// event fires *after* setActiveOffset and wipes the highlight.
	const suppressScrollHighlightClearRef = useRef(false);

	// Track the last offset we set so we can flush on unmount.
	// null = not yet loaded from DB, don't overwrite on unmount.
	const lastOffsetRef = useRef<number | null>(null);

	// ── Seed activeOffset + lastOffsetRef once book loads ─────────────────
	useEffect(() => {
		if (book) {
			setActiveOffset(book.position);
			setProgressOffset(book.position);
			lastOffsetRef.current = book.position;
		}
	}, [book]);

	// ── Build paragraph index ──────────────────────────────────────────────
	// Computed once per content load. Two cheap structures:
	//   paragraphs[i]       — the text of paragraph i
	//   paragraphOffsets[i] — UTF-8 byte offset of paragraph i's first character
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
	const contentBytes = useMemo(
		() => (content ? _encoder.encode(content) : null),
		[content],
	);

	const totalWordCount = useMemo(
		() => content?.match(/\S+/g)?.length ?? 0,
		[content],
	);

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

	// ── Per-paragraph highlight map ───────────────────────────────────────
	// Maps paragraphIndex → HighlightRange[] that overlap that paragraph.
	// Recomputed only when highlights or paragraph offsets change (not on scroll).
	const highlightsByParagraph = useMemo<Map<number, HighlightRange[]>>(() => {
		const map = new Map<number, HighlightRange[]>();
		if (highlightRows.length === 0 || paragraphOffsets.length === 0) return map;

		for (const h of highlightRows) {
			// Find paragraphs that overlap [h.startOffset, h.endOffset]
			for (let i = 0; i < paragraphOffsets.length; i++) {
				const paraStart = paragraphOffsets[i];
				const paraEnd =
					i + 1 < paragraphOffsets.length
						? paragraphOffsets[i + 1] - 2 // -2 for the "\n\n"
						: Number.POSITIVE_INFINITY;
				if (h.startOffset <= paraEnd && h.endOffset >= paraStart) {
					const existing = map.get(i);
					if (existing) {
						existing.push(h);
					} else {
						map.set(i, [h]);
					}
				}
			}
		}
		return map;
	}, [highlightRows, paragraphOffsets]);

	// ── Settings (RSVP + reader appearance) ──────────────────────────────
	const { data: dbSettings } = queryHooks.useSettings();

	const readerFontSize = dbSettings?.readerFontSize ?? DEFAULT_SETTINGS.READER_FONT_SIZE;
	const readerFontFamily = dbSettings?.readerFontFamily ?? DEFAULT_SETTINGS.READER_FONT_FAMILY;
	const readerLineSpacing = dbSettings?.readerLineSpacing ?? DEFAULT_SETTINGS.READER_LINE_SPACING;
	const readerMargin = dbSettings?.readerMargin ?? DEFAULT_SETTINGS.READER_MARGIN;

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
	// Fire-and-forget writes — no mutation wrapper needed for high-frequency saves.
	const savePosition = useCallback(
		async (offset: number) => {
			await queries.updateBook(id, { position: offset, lastRead: Date.now() });
			await pushPosition(offset);
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

			// Fine-tune: after the paragraph renders, scroll to the exact word.
			requestAnimationFrame(() => {
				const span = document.querySelector<HTMLElement>(`span[data-offset="${byteOffset}"]`);
				if (!span || !containerRef.current || !listRef.current) return;
				const delta =
					span.getBoundingClientRect().top - containerRef.current.getBoundingClientRect().top;
				if (delta > 2) {
					suppressNextScrollEndRef.current = true;
					if (highlight) suppressScrollHighlightClearRef.current = true;
					listRef.current.scrollBy(delta);
				}
			});
		},
		[findParagraphIndex, savePosition],
	);

	// ── Initial scroll to saved position ──────────────────────────────────
	// Also re-runs when readerMode changes to "scroll" (returning from RSVP).
	useEffect(() => {
		if (didInitialScrollRef.current) return;
		if (readerMode !== "scroll") return;
		if (!listRef.current || paragraphs.length === 0 || !book) return;

		didInitialScrollRef.current = true;

		// Use lastOffsetRef if available (e.g. returning from RSVP mode),
		// otherwise fall back to the DB-stored position.
		const target = lastOffsetRef.current ?? book.position;
		if (target === 0) return; // start of book — default scroll is correct

		const idx = findParagraphIndex(target);
		suppressNextScrollEndRef.current = true;
		suppressScrollHighlightClearRef.current = true;
		listRef.current.scrollToIndex(idx, { align: "start" });
		setActiveOffset(target);

		// Fine-tune to the exact word after the paragraph renders.
		// Needed for long paragraphs where the saved word could be
		// off-screen below the paragraph start. Double rAF ensures
		// VList's layout from scrollToIndex is fully committed.
		const listHandle = listRef.current;
		const container = containerRef.current;
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				const span = document.querySelector<HTMLElement>(`span[data-offset="${target}"]`);
				if (!span || !container || !listHandle) return;
				const delta = span.getBoundingClientRect().top - container.getBoundingClientRect().top;
				if (delta > 2) {
					suppressNextScrollEndRef.current = true;
					suppressScrollHighlightClearRef.current = true;
					listHandle.scrollBy(delta);
				}
			});
		});
	}, [readerMode, paragraphs, paragraphOffsets, book, findParagraphIndex]);

	// ── Scroll handler — hide highlight + update progress bar ──────────────
	const handleScroll = useCallback(
		(scrollOffset: number) => {
			// Cancel any pending long-press — user is scrolling, not selecting
			cancelAnyActiveLongPress();

			// Hide highlight while scrolling (skip if already hidden to avoid re-renders).
			// After a programmatic jump (search/chapter) we keep the highlight.
			if (!suppressScrollHighlightClearRef.current) {
				setActiveOffset((prev) => (prev === NO_HIGHLIGHT ? prev : NO_HIGHLIGHT));
			}
			// Hide progress bar — user is scrolling normally, not scrubbing
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
		[paragraphOffsets, isSelecting],
	);

	// ── Scroll end — find first fully visible word + save position ───────
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
			const rect = span.getBoundingClientRect();
			if (rect.top >= cutoffTop + rect.height) {
				bestOffset = Number.parseInt(span.dataset.offset!, 10);
				break;
			}
		}

		if (bestOffset < 0) return;

		setActiveOffset(bestOffset);
		setProgressOffset(bestOffset);
		lastOffsetRef.current = bestOffset;
		savePosition(bestOffset);
	}, [savePosition]);

	// ── Helper: extract text for a byte range ─────────────────────────────
	const extractRangeText = useCallback(
		(startOffset: number, endOffset: number): string => {
			if (!content) return "";
			const bytes = _encoder.encode(content);
			// Scan forward from endOffset to end of the last word
			let end = endOffset;
			while (end < bytes.length && bytes[end] !== 32 && bytes[end] !== 10) {
				end++;
			}
			return _decoder.decode(bytes.slice(startOffset, end)).replace(/\s+/g, " ").trim();
		},
		[content],
	);

	// ── Helper: find highlight covering an offset ─────────────────────────
	const findHighlightAt = useCallback(
		(offset: number): Highlight | undefined => {
			return highlightRows.find((h) => offset >= h.startOffset && offset <= h.endOffset);
		},
		[highlightRows],
	);

	// ── Word tap handler ───────────────────────────────────────────────────
	// During selection mode: tapping anywhere cancels the selection (user
	// adjusts range via handles, not word taps).
	// Normal mode — first tap: set position (highlight it).
	// Normal mode — second tap on highlighted word: open highlight modal (if highlighted)
	//   or dictionary (if not highlighted).
	const handleWordTap = useCallback(
		(offset: number, wordText: string) => {
			if (isSelecting) {
				// Any tap outside the handle drag system cancels the selection
				setSelectionAnchor(null);
				setSelectionEnd(null);
				setSelectionSavedId(null);
				setSelectionColor(null);
				setPendingNote("");
				return;
			}

			if (offset === activeOffset) {
				// Second tap on the highlighted word
				const highlight = findHighlightAt(offset);
				if (highlight) {
					// Open highlight editor
					const text = extractRangeText(highlight.startOffset, highlight.endOffset);
					setEditingHighlight(highlight);
					setEditingHighlightText(text);
				} else {
					// Open dictionary
					const clean = wordText.replace(/[^a-zA-Z'-]/g, "").toLowerCase();
					if (clean) setSelectedWord(clean);
				}
				return;
			}
			setActiveOffset(offset);
			setProgressOffset(offset);
			setProgressBarVisible(true);
			lastOffsetRef.current = offset;
			// Immediate save — no debounce
			queries.updateBook(id, { position: offset, lastRead: Date.now() });
			pushPosition(offset);
		},
		[id, pushPosition, activeOffset, isSelecting, findHighlightAt, extractRangeText],
	);

	// ── Long-press handler ────────────────────────────────────────────────
	// If the word is already highlighted → open the highlight editor.
	// Otherwise → enter selection mode to create a new highlight.
	const handleWordLongPress = useCallback(
		(offset: number) => {
			const existing = findHighlightAt(offset);
			if (existing) {
				const text = extractRangeText(existing.startOffset, existing.endOffset);
				setEditingHighlight(existing);
				setEditingHighlightText(text);
				return;
			}
			setSelectionAnchor(offset);
			setSelectionEnd(offset);
			setSelectionSavedId(null);
			setSelectionColor(null);
			setPendingNote("");
		},
		[findHighlightAt, extractRangeText],
	);

	// ── Handle position sync — positions the two fixed handle divs ───────
	// Called after any selection range change or scroll event.
	// Reads word span positions from the DOM and updates handle styles directly
	// (bypassing React renders for smooth visual updates).
	const syncHandlePositions = useCallback(() => {
		if (!selectionRange) return;
		const startSpan = document.querySelector<HTMLElement>(
			`span[data-offset="${selectionRange.start}"]`,
		);
		const endSpan = document.querySelector<HTMLElement>(
			`span[data-offset="${selectionRange.end}"]`,
		);

		// Position start handle: bar runs along the left edge of the start word.
		if (startHandleRef.current) {
			if (startSpan) {
				const rect = startSpan.getBoundingClientRect();
				startHandleRef.current.style.left = `${rect.left - HANDLE_H_HALF}px`;
				startHandleRef.current.style.top = `${rect.top - HANDLE_V_PAD}px`;
				startHandleRef.current.style.setProperty("--bar-height", `${rect.height}px`);
				startHandleRef.current.style.display = "block";
			} else {
				startHandleRef.current.style.display = "none";
			}
		}

		// Position end handle: bar runs along the right edge of the end word.
		if (endHandleRef.current) {
			if (endSpan) {
				const rect = endSpan.getBoundingClientRect();
				endHandleRef.current.style.left = `${rect.right - HANDLE_H_HALF}px`;
				endHandleRef.current.style.top = `${rect.top - HANDLE_V_PAD}px`;
				endHandleRef.current.style.setProperty("--bar-height", `${rect.height}px`);
				endHandleRef.current.style.display = "block";
			} else {
				endHandleRef.current.style.display = "none";
			}
		}

		// Position toolbar: above the selection start word if there is room,
		// otherwise below the selection end word.
		if (toolbarRef.current) {
			const GAP = 4;
			if (startSpan) {
				const startRect = startSpan.getBoundingClientRect();
				const above = startRect.top - SELECTION_TOOLBAR_H - GAP;
				if (above >= 0) {
					toolbarRef.current.style.top = `${above}px`;
					toolbarRef.current.style.bottom = "auto";
				} else if (endSpan) {
					const endRect = endSpan.getBoundingClientRect();
					// Below the end handle circle (bar-height + circle diameter ≈ end word height + 24)
					toolbarRef.current.style.top = `${endRect.bottom + endRect.height + 20 + GAP}px`;
					toolbarRef.current.style.bottom = "auto";
				}
			}
		}
	}, [selectionRange]);

	// Keep a ref so scroll handler can call it without stale-closure issues
	const syncHandlesRef = useRef(syncHandlePositions);
	useEffect(() => {
		syncHandlesRef.current = syncHandlePositions;
	}, [syncHandlePositions]);

	// Sync handle/toolbar positions after every render that changes selection or mode
	useLayoutEffect(() => {
		if (isSelecting) {
			syncHandlePositions();
		} else {
			if (startHandleRef.current) startHandleRef.current.style.display = "none";
			if (endHandleRef.current) endHandleRef.current.style.display = "none";
			// Toolbar is conditionally rendered (only when isSelecting) so no reset needed
		}
	}, [isSelecting, syncHandlePositions]);

	// ── Handle drag — pointerdown on the start (left) selection handle ────
	// Fixes which state variable is "start" at drag-begin to avoid mid-drag role swaps.
	const handleStartHandlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
		e.preventDefault();
		const target = e.currentTarget;
		target.style.pointerEvents = "none"; // transparent to elementFromPoint during drag
		const anchor = selectionAnchorRef.current ?? 0;
		const end = selectionEndRef.current ?? 0;
		const isAnchorStart = anchor <= end; // which var holds the min offset?
		const onMove = (me: PointerEvent) => {
			const el = document.elementFromPoint(me.clientX, me.clientY);
			const span = el?.closest<HTMLElement>("span[data-offset]");
			if (!span) return;
			const offset = Number.parseInt(span.dataset.offset!, 10);
			if (Number.isNaN(offset)) return;
			if (isAnchorStart) setSelectionAnchor(offset);
			else setSelectionEnd(offset);
		};
		const onUp = () => {
			target.style.pointerEvents = "";
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
		};
		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onUp);
	}, []);

	// ── Handle drag — pointerdown on the end (right) selection handle ─────
	const handleEndHandlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
		e.preventDefault();
		const target = e.currentTarget;
		target.style.pointerEvents = "none";
		const anchor = selectionAnchorRef.current ?? 0;
		const end = selectionEndRef.current ?? 0;
		const isAnchorEnd = anchor >= end; // which var holds the max offset?
		const onMove = (me: PointerEvent) => {
			const el = document.elementFromPoint(me.clientX, me.clientY);
			const span = el?.closest<HTMLElement>("span[data-offset]");
			if (!span) return;
			const offset = Number.parseInt(span.dataset.offset!, 10);
			if (Number.isNaN(offset)) return;
			if (isAnchorEnd) setSelectionAnchor(offset);
			else setSelectionEnd(offset);
		};
		const onUp = () => {
			target.style.pointerEvents = "";
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
		};
		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onUp);
	}, []);

	// ── Selection auto-save — triggered when the user picks a color ──────
	// First pick: creates the highlight. Subsequent picks: update color.
	// Toolbar stays open after saving so the user can adjust or add a note.
	const handleSelectionColorChange = useCallback(
		(newColor: HighlightColor) => {
			setSelectionColor(newColor);
			if (!selectionRange || !id) return;
			const now = Date.now();
			if (selectionSavedId) {
				updateHighlightMutation.mutate({
					id: selectionSavedId,
					bookId: id,
					data: { color: newColor, updatedAt: now },
				});
			} else {
				const newId = randomHexId();
				setSelectionSavedId(newId);
				addHighlightMutation.mutate({
					id: newId,
					bookId: id,
					startOffset: selectionRange.start,
					endOffset: selectionRange.end,
					color: newColor,
					note: pendingNote || null,
					createdAt: now,
					updatedAt: now,
				});
			}
		},
		[selectionRange, selectionSavedId, pendingNote, id, addHighlightMutation, updateHighlightMutation],
	);

	// ── Note save — called when the note modal closes ─────────────────────
	const handleSelectionNoteDone = useCallback(() => {
		setNoteInputOpen(false);
		if (selectionSavedId && id) {
			updateHighlightMutation.mutate({
				id: selectionSavedId,
				bookId: id,
				data: { note: pendingNote || null, updatedAt: Date.now() },
			});
		}
	}, [selectionSavedId, pendingNote, id, updateHighlightMutation]);

	// ── Selection cancel / close toolbar ─────────────────────────────────
	// Any saved highlight stays in the DB (X = "done", not "delete").
	const handleSelectionCancel = useCallback(() => {
		setSelectionAnchor(null);
		setSelectionEnd(null);
		setSelectionSavedId(null);
		setSelectionColor(null);
		setPendingNote("");
	}, []);

	// ── Highlight save (from edit modal) ──────────────────────────────────
	const handleHighlightSave = useCallback(
		(highlightId: string, color: string, note: string) => {
			updateHighlightMutation.mutate({
				id: highlightId,
				bookId: id,
				data: { color, note: note || null, updatedAt: Date.now() },
			});
		},
		[id, updateHighlightMutation],
	);

	// ── Highlight delete ──────────────────────────────────────────────────
	const handleHighlightDelete = useCallback(
		(highlightId: string) => {
			deleteHighlightMutation.mutate({ id: highlightId, bookId: id });
		},
		[id, deleteHighlightMutation],
	);

	// ── RSVP helpers ─────────────────────────────────────────────────────

	const handleRsvpPositionChange = useCallback(
		(byteOffset: number) => {
			setProgressOffset(byteOffset);
			lastOffsetRef.current = byteOffset;
			savePosition(byteOffset);
		},
		[savePosition],
	);

	/** Switch from RSVP to scroll mode, positioning VList at the given byte offset. */
	const exitRsvpToScroll = useCallback(
		(byteOffset: number) => {
			lastOffsetRef.current = byteOffset;
			setProgressOffset(byteOffset);
			// Clear stale scroll cache so VList doesn't restore the old position;
			// the initial scroll effect will position it at byteOffset instead.
			scrollCache.delete(id);
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
			setReaderMode("rsvp");
			setProgressBarVisible(true);
		} else {
			exitRsvpToScroll(lastOffsetRef.current ?? 0);
		}
	}, [readerMode, exitRsvpToScroll]);

	const handleRsvpFinished = useCallback(() => {
		exitRsvpToScroll(lastOffsetRef.current ?? 0);
	}, [exitRsvpToScroll]);

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

	// ── Progress bar tap/drag ─────────────────────────────────────────────
	const progressBarRef = useRef<HTMLDivElement>(null);
	// Origin of the current pointer-down gesture — used to detect horizontal intent
	const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
	// Minimum horizontal travel (px) before a drag is treated as a scrub.
	// Below this threshold a vertical swipe-up (home gesture) is ignored.
	const MIN_SCRUB_PX = 8;

	const scrubToX = useCallback(
		(clientX: number) => {
			if (!progressBarRef.current || !book) return;
			const rect = progressBarRef.current.getBoundingClientRect();
			const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
			const targetByte = Math.round(ratio * book.size);

			if (readerMode === "rsvp") {
				// In RSVP mode: update byte offset — RsvpView reacts via initialByteOffset prop
				setProgressOffset(targetByte);
				lastOffsetRef.current = targetByte;
				savePosition(targetByte);
			} else {
				const idx = findParagraphIndex(targetByte);
				const actualByte = paragraphOffsets[idx] ?? 0;
				jumpToOffset(actualByte, { highlight: false });
			}
		},
		[book, readerMode, paragraphOffsets, findParagraphIndex, jumpToOffset, savePosition],
	);

	const handleProgressPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
		e.currentTarget.setPointerCapture(e.pointerId);
		// Record origin — scrubbing is committed only once horizontal intent is
		// confirmed (pointermove/pointerup). This prevents the iOS swipe-up home
		// gesture from accidentally jumping the reading position.
		pointerDownRef.current = { x: e.clientX, y: e.clientY };
	}, []);

	/** Returns true when the pointer has moved far enough horizontally to count as a scrub. */
	const isHorizontalScrub = (
		origin: { x: number; y: number },
		clientX: number,
		clientY: number,
	) => {
		const dx = Math.abs(clientX - origin.x);
		const dy = Math.abs(clientY - origin.y);
		return dx >= MIN_SCRUB_PX && dx > dy;
	};

	const handleProgressPointerMove = useCallback(
		(e: React.PointerEvent<HTMLDivElement>) => {
			if (e.buttons === 0 || !pointerDownRef.current) return;
			if (!isHorizontalScrub(pointerDownRef.current, e.clientX, e.clientY)) return;
			isScrubbingRef.current = true;
			scrubToX(e.clientX);
		},
		[scrubToX],
	);

	const handleProgressPointerUp = useCallback(
		(e: React.PointerEvent<HTMLDivElement>) => {
			const origin = pointerDownRef.current;
			pointerDownRef.current = null;
			isScrubbingRef.current = false;
			if (!origin) return;
			// Plain tap (no meaningful horizontal drag) — scrub to the tap position.
			if (!isHorizontalScrub(origin, e.clientX, e.clientY)) {
				setProgressBarVisible(true);
				scrubToX(e.clientX);
			}
		},
		[scrubToX],
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

	// ── Save scroll cache + flush position on unmount ─────────────────────
	useEffect(() => {
		return () => {
			if (listRef.current) {
				scrollCache.set(id, listRef.current.cache);
			}
			// Flush position to DB so the library shows updated progress.
			// Only write if we actually loaded the book (lastOffsetRef !== null).
			const offset = lastOffsetRef.current;
			if (offset !== null) {
				queries.updateBook(id, { position: offset, lastRead: Date.now() });
			}
			// Invalidate the books list so the library grid picks up the new position
			// when the user navigates back.
			qc.invalidateQueries({ queryKey: bookKeys.all });
		};
	}, [id, qc]);

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

	const estimateWpm = readerMode === "rsvp" ? rsvpSettings.wpm : 250;
	const bookMinutesRemaining =
		totalWordCount > 0 ? (totalWordCount * (1 - progressPct / 100)) / estimateWpm : 0;
	let chapterMinutesRemaining: number | null = null;
	if (currentChapterIndex >= 0 && contentBytes) {
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
							<IonButton onClick={() => setHighlightsListOpen(true)} aria-label="View highlights">
								<IonIcon slot="icon-only" icon={bookmarkOutline} />
							</IonButton>
						)}
						<IonButton
							id="appearance-trigger"
							aria-label="Appearance settings"
						>
							<IonIcon slot="icon-only" icon={readerOutline} />
						</IonButton>
					</IonButtons>
				</IonToolbar>
			</IonHeader>

			<IonContent scrollY={false}>
				{contentPending || !content ? (
					<div style={{ padding: "16px 20px", height: "100%", overflow: "hidden" }}>
						{skeletonLines.map((style, i) => (
							<div key={i} className="reader-skeleton-line" style={style} />
						))}
					</div>
				) : readerMode === "scroll" ? (
					<div
						ref={containerRef}
						style={
							{
								height: "100%",
								"--reader-line-height": String(readerLineSpacing),
							} as React.CSSProperties
						}
					>
						<VList
							ref={listRef}
							cache={scrollCache.get(id)}
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
									onWordLongPress={handleWordLongPress}
									highlights={highlightsByParagraph.get(i)}
									selectionRange={selectionRange}
								/>
							))}
						</VList>
					</div>
				) : (
					<RsvpView
						content={content}
						initialByteOffset={progressOffset}
						settings={rsvpSettings}
						fontSize={readerFontSize}
						onPositionChange={handleRsvpPositionChange}
						onFinished={handleRsvpFinished}
					/>
				)}

				{/* ── Progress bar ── */}
				{(progressBarVisible || readerMode === "rsvp") && (
					// biome-ignore lint/a11y/useFocusableInteractive: scrubber
					<div
						ref={progressBarRef}
						className="reader-progress-bar"
						onPointerDown={handleProgressPointerDown}
						onPointerMove={handleProgressPointerMove}
						onPointerUp={handleProgressPointerUp}
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
								{bookMinutesRemaining > 0 && (
									<> · {formatReadingTime(bookMinutesRemaining)} left</>
								)}
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

			{/* ── Selection toolbar (fixed, positioned above selection by JS) ── */}
			{isSelecting && (
				<SelectionToolbar
					ref={toolbarRef}
					selectedColor={selectionColor}
					onColorChange={handleSelectionColorChange}
					onNote={() => setNoteInputOpen(true)}
					onCancel={handleSelectionCancel}
				/>
			)}

			{/* ── Selection handles (fixed position, one at each boundary) ── */}
			{/* biome-ignore lint/a11y/useKeyWithMouseEvents: touch-only handles */}
			<div
				ref={startHandleRef}
				className="selection-handle selection-handle--start"
				style={{ display: "none" }}
				onPointerDown={handleStartHandlePointerDown}
			/>
			{/* biome-ignore lint/a11y/useKeyWithMouseEvents: touch-only handles */}
			<div
				ref={endHandleRef}
				className="selection-handle selection-handle--end"
				style={{ display: "none" }}
				onPointerDown={handleEndHandlePointerDown}
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
				highlight={editingHighlight}
				highlightText={editingHighlightText}
				onClose={() => setEditingHighlight(null)}
				onSave={handleHighlightSave}
				onDelete={handleHighlightDelete}
				theme={theme}
			/>

			{/* ── Highlights list modal ── */}
			<HighlightsListModal
				isOpen={highlightsListOpen}
				highlights={highlightRows}
				content={content ?? ""}
				onClose={() => setHighlightsListOpen(false)}
				onJump={jumpToOffset}
				theme={theme}
			/>

			{/* ── Note input modal (during selection) ── */}
			<IonModal
				isOpen={noteInputOpen}
				onDidDismiss={handleSelectionNoteDone}
				breakpoints={[0, 0.4]}
				initialBreakpoint={0.4}
				className={["rsvp-highlight-modal", `reader-theme-${theme}`].join(" ")}
			>
				<IonHeader>
					<IonToolbar>
						<IonTitle>Add Note</IonTitle>
						<IonButtons slot="end">
							<IonButton onClick={handleSelectionNoteDone} strong>
								Done
							</IonButton>
						</IonButtons>
					</IonToolbar>
				</IonHeader>
				<IonContent className="ion-padding">
					<textarea
						className="highlight-note-textarea"
						value={pendingNote}
						onChange={(e) => setPendingNote(e.target.value)}
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
