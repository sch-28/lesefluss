/**
 * BookReader - chrome + state owner for the in-app book reader.
 *
 * Owns: book/content/highlight queries, mode state (scroll | rsvp),
 * the current byte offset (active/progress/last), chapters + paragraph index,
 * the selection + scrub hooks, and all overlay modals (TOC, search,
 * dictionary, highlight editor, highlights list, note input). Dispatches
 * the actual rendering of the book to a sibling view component:
 *
 *   - <ScrollView />    virtualized scrolling reader (default)
 *   - <RsvpView />      word-by-word RSVP reader
 *
 * Data model:
 *   paragraphs[]       string[]   content.split("\n\n")
 *   paragraphOffsets[] number[]   UTF-8 byte offset where each paragraph starts
 *
 * Position model: byte offsets into the original UTF-8 content. The ESP32
 * uses the same offsets, so writes round-trip cleanly.
 *
 * Sub-modules:
 *   use-highlight-selection - selection state + handles + edit modal + list modal
 *   use-scrub-progress       - progress-bar pointer gestures
 *   selection-overlay        - JSX for the floating toolbar + drag handles
 */

import { Browser } from "@capacitor/browser";
import {
	IonActionSheet,
	IonBackButton,
	IonButton,
	IonButtons,
	IonContent,
	IonHeader,
	IonIcon,
	IonModal,
	IonPage,
	IonSpinner,
	IonTitle,
	IonToolbar,
	useIonViewWillLeave,
} from "@ionic/react";
import type { RsvpSettings } from "@lesefluss/rsvp-core";
import { DEFAULT_SETTINGS } from "@lesefluss/rsvp-core";
import { useQueryClient } from "@tanstack/react-query";
import {
	bookmarksOutline,
	chevronBackOutline,
	chevronForwardOutline,
	ellipsisVerticalOutline,
	flashOffOutline,
	flashOutline,
	openOutline,
	readerOutline,
	searchOutline,
} from "ionicons/icons";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RouteComponentProps } from "react-router-dom";
import { toast } from "../../components/toast";
import { useBookSync } from "../../contexts/book-sync-context";
import { useTheme } from "../../contexts/theme-context";
import { useAutoSaveSettings } from "../../hooks/use-auto-save-settings";
import { queryHooks } from "../../services/db/hooks";
import { bookKeys } from "../../services/db/hooks/query-keys";
import { queries } from "../../services/db/queries";
import type { Chapter, GlossaryEntry } from "../../services/db/schema";
import { providerLabel } from "../../services/serial-scrapers";
import { pushSync, scheduleSyncPush } from "../../services/sync";
import { formatReadingTime } from "../../utils/reading-time";
import AnnotationsSheet from "./annotations-sheet";
import AppearancePopover from "./appearance-popover";
import { useChapterAutoAdvance } from "./chapter-auto-advance";
import { useChapterFetch } from "./chapter-fetch";
import { ChapterStateOverlay } from "./chapter-state-overlay";
import DictionaryModal from "./dictionary-modal";
import { colorFromLabel } from "./glossary-avatar";
import GlossaryEntryModal from "./glossary-entry-modal";
import { generateGlossaryId } from "./glossary-utils";
import HighlightModal from "./highlight-modal";
import { NextChapterFooter } from "./next-chapter-footer";
import PageView from "./page-view";
import { getWordOffsets, utf8ByteLength } from "./paragraph";
import { stripPunct } from "./rsvp-engine";
import RsvpView from "./rsvp-view";
import ScrollView, { ReaderSkeleton } from "./scroll-view";
import SearchModal from "./search-modal";
import SelectionOverlay from "./selection-overlay";
import {
	findFirstMention,
	findNextMention,
	getMentionContext,
	useGlossaryDecorations,
} from "./use-glossary-decorations";
import { useHighlightSelection } from "./use-highlight-selection";
import { useScrubProgress } from "./use-scrub-progress";
import type { ReaderViewHandle } from "./view-types";

// ─── Module-level singletons ─────────────────────────────────────────────────
const _encoder = new TextEncoder();
const _decoder = new TextDecoder();

// Sentinel value: no word highlighted (while scrolling)
const NO_HIGHLIGHT = -1;

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
	const { data: glossaryEntries = [] } = queryHooks.useGlossary(id);
	const addGlossaryEntry = queryHooks.useAddGlossaryEntry();
	const updateGlossaryEntry = queryHooks.useUpdateGlossaryEntry();
	const deleteGlossaryEntry = queryHooks.useDeleteGlossaryEntry();

	// ── Chapter (serial) integration — no-ops for standalone books ────────
	// Both hooks early-return when `book.seriesId` is null, so the existing
	// book flow is unaffected. New logic lives in the hooks; this file just
	// composes them.
	const chapterFetch = useChapterFetch(book);
	const chapterAdvance = useChapterAutoAdvance(book);

	// Series-aware boundaries for the header chevrons. The chapter-counts map
	// is already cached for the library grid, so this is free. `hasPrev` and
	// `hasNext` collapse to `false` for standalone books — the chevrons aren't
	// rendered at all in that case (the parent JSX checks `book?.seriesId`).
	const { data: seriesChapterCounts } = queryHooks.useSeriesChapterCounts();
	const seriesTotal = book?.seriesId != null ? seriesChapterCounts?.get(book.seriesId) : undefined;
	const hasPrev = book?.chapterIndex != null && book.chapterIndex > 0;
	const hasNext =
		book?.chapterIndex != null && seriesTotal != null && book.chapterIndex < seriesTotal - 1;

	const { theme } = useTheme();
	const [annotationsOpen, setAnnotationsOpen] = useState(false);
	const [overflowOpen, setOverflowOpen] = useState(false);
	const { data: series } = queryHooks.useSeries(book?.seriesId);
	const [editingGlossaryEntry, setEditingGlossaryEntry] = useState<GlossaryEntry | null>(null);
	// Tracks entry IDs that exist only in component state, not in SQLite yet.
	// "Add" creates one of these so we don't push an empty-label row to sync
	// (which would fail SyncGlossaryEntrySchema validation and break the whole payload).
	// First non-empty label commit promotes the draft to a real DB row.
	const draftGlossaryIdsRef = useRef<Set<string>>(new Set());
	const [searchOpen, setSearchOpen] = useState(false);
	const [searchInitialQuery, setSearchInitialQuery] = useState<string | undefined>(undefined);
	const [selectedWord, setSelectedWord] = useState<string | null>(null);
	// Original-casing form of the looked-up word, for glossary entries (the dict
	// modal itself is fed the lowercased clean form because the API needs it).
	const selectedWordOriginalRef = useRef<string | null>(null);

	const openDictionaryModal = useCallback((clean: string, original: string) => {
		selectedWordOriginalRef.current = original;
		setSelectedWord(clean);
	}, []);

	const closeDictionaryModal = useCallback(() => {
		setSelectedWord(null);
		selectedWordOriginalRef.current = null;
	}, []);

	// ── Reader mode ───────────────────────────────────────────────────────
	// Two top-level modes: the user toggles between them with the flash button.
	// Within "standard", the rendered view is scroll or page depending on the
	// paginationStyle setting (decided at render time, not stored here).
	const [readerMode, setReaderMode] = useState<"standard" | "rsvp">("standard");

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

	const scrollViewRef = useRef<ReaderViewHandle>(null);

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

	const readerFontSize = dbSettings?.readerFontSize ?? DEFAULT_SETTINGS.READER_FONT_SIZE;
	const readerFontFamily = dbSettings?.readerFontFamily ?? DEFAULT_SETTINGS.READER_FONT_FAMILY;
	const readerLineSpacing = dbSettings?.readerLineSpacing ?? DEFAULT_SETTINGS.READER_LINE_SPACING;
	const readerMargin = dbSettings?.readerMargin ?? DEFAULT_SETTINGS.READER_MARGIN;
	const readerActiveWordUnderline =
		dbSettings?.readerActiveWordUnderline ?? DEFAULT_SETTINGS.READER_ACTIVE_WORD_UNDERLINE;
	const readerGlossaryUnderline =
		dbSettings?.readerGlossaryUnderline ?? DEFAULT_SETTINGS.READER_GLOSSARY_UNDERLINE;
	const paginationStyle = dbSettings?.paginationStyle ?? DEFAULT_SETTINGS.PAGINATION_STYLE;

	// ── Apply default reader mode once settings + book are loaded ─────────
	// Runs once; subsequent settings changes don't flip the user's in-session mode.
	// (paginationStyle changes take effect on next render — no swap effect needed,
	// since the render branch reads the setting directly.)
	useEffect(() => {
		if (!didSeedModeRef.current && dbSettings && book) {
			didSeedModeRef.current = true;
			if (dbSettings.defaultReaderMode === "rsvp") {
				setReaderMode("rsvp");
				setProgressBarVisible(true);
			}
		}
	}, [dbSettings, book]);

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

	/** Update parent state for a programmatic position change, then delegate the
	 *  visual scroll to whichever view is mounted. */
	const jumpToOffset = useCallback(
		(byteOffset: number, { highlight = true }: { highlight?: boolean } = {}) => {
			setActiveOffset(byteOffset);
			setProgressOffset(byteOffset);
			lastOffsetRef.current = byteOffset;
			savePosition(byteOffset);
			scrollViewRef.current?.jumpTo(byteOffset, { highlight });
		},
		[savePosition],
	);

	// ── Highlight / selection state ──────────────────────────────────────
	const sel = useHighlightSelection({
		bookId: id,
		contentBytes,
		highlightRows,
		paragraphOffsets,
	});

	// ── Glossary inline-underline decorations ──────────────────────────────
	const glossaryByParagraph = useGlossaryDecorations({
		entries: glossaryEntries,
		paragraphs,
		paragraphOffsets,
		enabled: readerGlossaryUnderline,
	});

	/** Find any glossary range covering this byte offset (used by tap handlers). */
	const findGlossaryAt = useCallback(
		(offset: number): GlossaryEntry | undefined => {
			for (const ranges of glossaryByParagraph.values()) {
				for (const r of ranges) {
					if (offset >= r.startOffset && offset <= r.endOffset) {
						return glossaryEntries.find((e) => e.id === r.entryId);
					}
				}
			}
			return undefined;
		},
		[glossaryByParagraph, glossaryEntries],
	);

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

	// ── ScrollView callbacks ──────────────────────────────────────────────
	const { isSelecting, syncHandlesRef } = sel;
	const { isScrubbingRef } = scrub;

	const handleScrollPositionSettle = useCallback(
		(offset: number) => {
			setActiveOffset(offset);
			setProgressOffset(offset);
			lastOffsetRef.current = offset;
			savePosition(offset);
			// 32-byte tolerance for word-boundary settles. The `size > 32` guard
			// avoids firing on freshly-fetched chapters whose `size` momentarily
			// reads 0. No-op for non-serials inside `tryAdvance` itself.
			if (book && book.size > 32 && offset >= book.size - 32) {
				void chapterAdvance.tryAdvance();
			}
		},
		[savePosition, chapterAdvance, book],
	);

	const handleScrollHighlightClear = useCallback(() => {
		setActiveOffset((prev) => (prev === NO_HIGHLIGHT ? prev : NO_HIGHLIGHT));
	}, []);

	const handleScrollHideProgressBar = useCallback(() => setProgressBarVisible(false), []);
	const handleScrollShowProgressBar = useCallback(() => setProgressBarVisible(true), []);
	const handleSetActiveOffset = useCallback((offset: number) => setActiveOffset(offset), []);
	const handleSetProgressOffset = useCallback((offset: number) => setProgressOffset(offset), []);

	const syncSelectionHandles = useCallback(() => {
		syncHandlesRef.current();
	}, [syncHandlesRef]);

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
				// Second tap on the highlighted word.
				// Glossary takes precedence over dictionary so users can quickly review what
				// a tracked term is. Highlights still win over glossary because they're
				// explicit user intent on a specific range.
				const existing = findHighlightAt(offset);
				if (existing) {
					openHighlightEditor(existing);
					return;
				}
				const glossary = findGlossaryAt(offset);
				if (glossary) {
					setEditingGlossaryEntry(glossary);
					return;
				}
				// No annotation here — fall back to dictionary
				const original = stripPunct(wordText);
				const clean = original.toLowerCase();
				if (clean) openDictionaryModal(clean, original);
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
			findGlossaryAt,
			openDictionaryModal,
		],
	);

	// Page mode uses tap zones for navigation; word taps are intentionally inert
	// (long-press is the entry point for selection / highlight / look-up). The
	// only thing we still honour is "tap dismisses an active selection".
	const handlePageWordTap = useCallback(() => {
		if (isSelecting) cancelSelection();
	}, [isSelecting, cancelSelection]);

	// Long-press → selection toolbar → "Look up" reads the word's rendered text
	// straight from the DOM (selection.start is the data-offset of a word span)
	// and opens the existing dictionary modal. Cleans punctuation the same way
	// handleWordTap's dictionary path does.
	const handleSelectionLookup = useCallback(() => {
		const range = sel.selectionRange;
		if (!range) return;
		const span = document.querySelector<HTMLElement>(`span[data-offset="${range.start}"]`);
		const raw = span?.textContent ?? "";
		const original = stripPunct(raw);
		const clean = original.toLowerCase();
		if (clean) openDictionaryModal(clean, original);
		sel.cancelSelection();
	}, [sel, openDictionaryModal]);

	// Open an existing entry whose label matches case-insensitively, or commit a
	// new one. Used by both the selection toolbar and the dictionary modal so the
	// dedupe/create rules stay in lockstep.
	const findOrCreateGlossary = useCallback(
		(snippet: string) => {
			const trimmed = snippet.trim();
			if (!trimmed) return;
			const existing = glossaryEntries.find((e) => e.label.toLowerCase() === trimmed.toLowerCase());
			if (existing) {
				setEditingGlossaryEntry(existing);
				return;
			}
			const now = Date.now();
			const newEntry: GlossaryEntry = {
				id: generateGlossaryId(),
				bookId: id,
				label: trimmed,
				notes: null,
				color: colorFromLabel(trimmed),
				hideMarker: false,
				createdAt: now,
				updatedAt: now,
			};
			addGlossaryEntry.mutate(newEntry, {
				onSuccess: () => setEditingGlossaryEntry(newEntry),
			});
		},
		[id, addGlossaryEntry, glossaryEntries],
	);

	// Long-press → selection toolbar → "Add to glossary" extracts the selected
	// text snippet and routes it through findOrCreateGlossary.
	const handleAddToGlossary = useCallback(() => {
		const range = sel.selectionRange;
		if (!range) {
			sel.cancelSelection();
			return;
		}
		const snippet = sel.extractRangeText(range.start, range.end).trim();
		if (!snippet) {
			toast.info("Nothing selected to add to glossary");
			sel.cancelSelection();
			return;
		}
		findOrCreateGlossary(snippet);
		sel.cancelSelection();
	}, [sel, findOrCreateGlossary]);

	// Dictionary modal → "Add to glossary": prefers the original-cased form
	// captured at lookup time so proper-noun casing survives (e.g. "Paris" not
	// "paris", which is what the API saw).
	const handleAddWordToGlossary = useCallback(
		(word: string) => {
			const snippet = selectedWordOriginalRef.current ?? word;
			closeDictionaryModal();
			findOrCreateGlossary(snippet);
		},
		[closeDictionaryModal, findOrCreateGlossary],
	);

	const handleRsvpLookup = useCallback(
		(clean: string, original: string) => openDictionaryModal(clean, original),
		[openDictionaryModal],
	);

	const handleDictSearch = useCallback(
		(w: string) => {
			closeDictionaryModal();
			setSearchInitialQuery(w);
			setSearchOpen(true);
		},
		[closeDictionaryModal],
	);

	// "Add" from the annotations sheet — opens a *draft* entry that lives only in
	// component state. The first label commit promotes it to a DB row. This avoids
	// pushing empty-label rows that fail SyncGlossaryEntrySchema (label.min(1)).
	const handleAddEntryFromSheet = useCallback(() => {
		const now = Date.now();
		const draft: GlossaryEntry = {
			id: generateGlossaryId(),
			bookId: id,
			label: "",
			notes: null,
			color: colorFromLabel(""),
			hideMarker: false,
			createdAt: now,
			updatedAt: now,
		};
		draftGlossaryIdsRef.current.add(draft.id);
		setAnnotationsOpen(false);
		setEditingGlossaryEntry(draft);
	}, [id]);

	const handleGlossarySave = useCallback(
		(
			entryId: string,
			patch: Partial<Pick<GlossaryEntry, "label" | "notes" | "color" | "bookId" | "hideMarker">>,
		) => {
			const now = Date.now();
			setEditingGlossaryEntry((prev) => {
				if (!prev || prev.id !== entryId) return prev;
				const next: GlossaryEntry = { ...prev, ...patch, updatedAt: now };
				if (draftGlossaryIdsRef.current.has(entryId)) {
					// Promote to DB row only once the label is non-empty
					if (next.label.trim().length > 0) {
						addGlossaryEntry.mutate(next);
						draftGlossaryIdsRef.current.delete(entryId);
					}
				} else {
					updateGlossaryEntry.mutate({
						id: entryId,
						data: { ...patch, updatedAt: now },
					});
				}
				return next;
			});
		},
		[addGlossaryEntry, updateGlossaryEntry],
	);

	const handleGlossaryDelete = useCallback(
		(entryId: string) => {
			if (draftGlossaryIdsRef.current.has(entryId)) {
				// Never made it to the DB — just discard
				draftGlossaryIdsRef.current.delete(entryId);
				return;
			}
			deleteGlossaryEntry.mutate({ id: entryId });
		},
		[deleteGlossaryEntry],
	);

	// On modal close, if a draft was abandoned without a label, drop it silently.
	const handleGlossaryModalClose = useCallback(() => {
		setEditingGlossaryEntry((prev) => {
			if (prev && draftGlossaryIdsRef.current.has(prev.id)) {
				draftGlossaryIdsRef.current.delete(prev.id);
			}
			return null;
		});
	}, []);

	const editingMentionContext = useMemo(
		() => (editingGlossaryEntry ? getMentionContext(editingGlossaryEntry.label, paragraphs) : null),
		[editingGlossaryEntry, paragraphs],
	);

	const handleJumpFirstMention = useCallback(
		(label: string) => {
			const offset = findFirstMention(label, paragraphs, paragraphOffsets);
			if (offset !== null) jumpToOffset(offset);
		},
		[paragraphs, paragraphOffsets, jumpToOffset],
	);

	const handleJumpNextMention = useCallback(
		(label: string) => {
			const offset = findNextMention(label, activeOffset, paragraphs, paragraphOffsets);
			if (offset !== null) jumpToOffset(offset);
		},
		[paragraphs, paragraphOffsets, jumpToOffset, activeOffset],
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

	/** Switch from RSVP back to the standard reader, positioning the
	 *  next-mounted view at the given byte offset (consumed via
	 *  initialByteOffset on remount). The actual scroll-vs-page choice
	 *  happens at render time based on paginationStyle. */
	const exitRsvpToStandard = useCallback(
		(byteOffset: number) => {
			lastOffsetRef.current = byteOffset;
			setProgressOffset(byteOffset);
			setReaderMode("standard");
			savePosition(byteOffset);
		},
		[savePosition],
	);

	const handleRsvpToggle = useCallback(() => {
		if (readerMode !== "rsvp") {
			// Use lastOffsetRef (word-level accurate from handleScrollEnd)
			// instead of progressOffset (paragraph-level from handleScroll).
			const offset = lastOffsetRef.current ?? 0;
			setProgressOffset(offset);
			setRsvpInitOffset(offset);
			setReaderMode("rsvp");
			setProgressBarVisible(true);
		} else {
			exitRsvpToStandard(lastOffsetRef.current ?? 0);
		}
	}, [readerMode, exitRsvpToStandard]);

	const handleRsvpFinished = useCallback(() => {
		exitRsvpToStandard(lastOffsetRef.current ?? 0);
		// No-op for standalone books; navigates to next chapter for serials.
		void chapterAdvance.tryAdvance();
	}, [exitRsvpToStandard, chapterAdvance]);

	const handleRsvpWpmChange = useCallback(
		(wpm: number) => updateSetting("wpm", wpm),
		[updateSetting],
	);

	// ── Chapter jump ──────────────────────────────────────────────────────
	const handleChapterJump = useCallback(
		(startByte: number) => {
			if (readerMode === "rsvp") {
				exitRsvpToStandard(startByte);
			} else {
				jumpToOffset(startByte);
			}
		},
		[readerMode, jumpToOffset, exitRsvpToStandard],
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
				exitRsvpToStandard(wordByte);
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
			exitRsvpToStandard,
		],
	);

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

	// Drop any in-progress selection at the *start* of a leave transition (back
	// gesture, programmatic nav). The selection toolbar/handles render via a
	// portal on document.body, so without this they'd stay pinned in place
	// while the page slides out and visibly flash over the next page.
	useIonViewWillLeave(() => {
		sel.cancelSelection();
	});

	// touch-action: none is applied directly to the handle elements via CSS
	// so the scroll container remains scrollable during selection mode.

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

	// Shared end-of-chapter footer for both views. Returns null inside
	// `NextChapterFooter` for standalone books / last-chapter, so it's safe
	// to drop in unconditionally.
	const advanceFooter = (
		<NextChapterFooter
			hasPrev={hasPrev}
			hasNext={hasNext}
			onNext={() => void chapterAdvance.tryAdvance()}
			onPrev={() => void chapterAdvance.tryRetreat()}
		/>
	);

	return (
		<IonPage className={`reader-theme-${theme}`}>
			<IonHeader class="ion-no-border">
				<IonToolbar>
					<IonButtons slot="start">
						<IonBackButton defaultHref="/tabs/library" />
						{book.seriesId != null && (
							<>
								<IonButton
									onClick={() => void chapterAdvance.tryRetreat()}
									disabled={!hasPrev}
									aria-label="Previous chapter"
								>
									<IonIcon slot="icon-only" icon={chevronBackOutline} />
								</IonButton>
								<IonButton
									onClick={() => void chapterAdvance.tryAdvance()}
									disabled={!hasNext}
									aria-label="Next chapter"
								>
									<IonIcon slot="icon-only" icon={chevronForwardOutline} />
								</IonButton>
							</>
						)}
					</IonButtons>
					<IonTitle>{book.title}</IonTitle>
					<IonButtons slot="end">
						<IonButton
							onClick={handleRsvpToggle}
							disabled={!content}
							aria-label={
								readerMode === "rsvp" ? "Switch to standard reader" : "Switch to RSVP reader"
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
						<IonButton
							onClick={() => setAnnotationsOpen(true)}
							aria-label="Annotations"
							disabled={!content}
						>
							<IonIcon slot="icon-only" icon={bookmarksOutline} />
						</IonButton>
						<IonButton id="appearance-trigger" aria-label="Appearance settings">
							<IonIcon slot="icon-only" icon={readerOutline} />
						</IonButton>
						{book.seriesId != null && book.chapterSourceUrl != null && (
							<IonButton onClick={() => setOverflowOpen(true)} aria-label="More actions">
								<IonIcon slot="icon-only" icon={ellipsisVerticalOutline} />
							</IonButton>
						)}
					</IonButtons>
				</IonToolbar>
			</IonHeader>

			<IonContent scrollY={false}>
				{chapterFetch.kind === "locked" ? (
					<ChapterStateOverlay status="locked" />
				) : chapterFetch.kind === "error" ? (
					<ChapterStateOverlay
						status="error"
						reason={chapterFetch.reason}
						onRetry={chapterFetch.retry}
					/>
				) : contentPending || !content || chapterFetch.kind === "loading" ? (
					<ReaderSkeleton />
				) : readerMode === "rsvp" ? (
					<RsvpView
						content={content}
						initialByteOffset={rsvpInitOffset}
						settings={rsvpSettings}
						fontSize={readerFontSize}
						onPositionChange={handleRsvpPositionChange}
						onFinished={handleRsvpFinished}
						onWpmChange={handleRsvpWpmChange}
						onLookup={handleRsvpLookup}
					/>
				) : paginationStyle === "page" ? (
					<PageView
						ref={scrollViewRef}
						key={`page-${id}`}
						paragraphs={paragraphs}
						paragraphOffsets={paragraphOffsets}
						contentLength={contentBytes?.length ?? content.length}
						initialByteOffset={lastOffsetRef.current ?? book.position}
						fontSize={readerFontSize}
						fontFamily={readerFontFamily}
						lineSpacing={readerLineSpacing}
						margin={readerMargin}
						showActiveWordUnderline={readerActiveWordUnderline}
						activeOffset={activeOffset}
						highlightsByParagraph={sel.highlightsByParagraph}
						glossaryByParagraph={glossaryByParagraph}
						selectionRange={sel.selectionRange}
						isSelecting={isSelecting}
						onWordTap={handlePageWordTap}
						onWordLongPress={sel.handleWordLongPress}
						onWordMouseDragStart={handleWordMouseDragStart}
						onCancelSelection={sel.cancelSelection}
						onPositionSettle={handleScrollPositionSettle}
						onInitialActiveOffset={handleSetActiveOffset}
						onTap={handleScrollShowProgressBar}
						footer={advanceFooter}
					/>
				) : (
					<ScrollView
						ref={scrollViewRef}
						key={`scroll-${id}`}
						paragraphs={paragraphs}
						paragraphOffsets={paragraphOffsets}
						findParagraphIndex={findParagraphIndex}
						initialByteOffset={lastOffsetRef.current ?? book.position}
						fontSize={readerFontSize}
						fontFamily={readerFontFamily}
						lineSpacing={readerLineSpacing}
						margin={readerMargin}
						showActiveWordUnderline={readerActiveWordUnderline}
						activeOffset={activeOffset}
						highlightsByParagraph={sel.highlightsByParagraph}
						glossaryByParagraph={glossaryByParagraph}
						selectionRange={sel.selectionRange}
						onWordTap={handleWordTap}
						onWordLongPress={sel.handleWordLongPress}
						onWordMouseDragStart={handleWordMouseDragStart}
						onPositionSettle={handleScrollPositionSettle}
						onInitialActiveOffset={handleSetActiveOffset}
						onProgressChange={handleSetProgressOffset}
						onHighlightClear={handleScrollHighlightClear}
						onHideProgressBar={handleScrollHideProgressBar}
						onTap={handleScrollShowProgressBar}
						isSelecting={isSelecting}
						syncSelectionHandles={syncSelectionHandles}
						isScrubbingRef={isScrubbingRef}
						footer={advanceFooter}
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
				isSingleWord={!!sel.selectionRange && sel.selectionRange.start === sel.selectionRange.end}
				selectionColor={sel.selectionColor}
				toolbarRef={sel.toolbarRef}
				startHandleRef={sel.startHandleRef}
				endHandleRef={sel.endHandleRef}
				onColorChange={sel.handleSelectionColorChange}
				onNote={() => sel.setNoteInputOpen(true)}
				onLookup={handleSelectionLookup}
				onAddToGlossary={handleAddToGlossary}
				onCancel={sel.cancelSelection}
				onStartHandlePointerDown={sel.handleStartHandlePointerDown}
				onEndHandlePointerDown={sel.handleEndHandlePointerDown}
			/>

			{/* ── Appearance popover ── */}
			<AppearancePopover trigger="appearance-trigger" />

			{/* ── Toolbar overflow action sheet (chapter-level actions) ── */}
			<IonActionSheet
				isOpen={overflowOpen}
				onDidDismiss={() => setOverflowOpen(false)}
				cssClass="rsvp-action-sheet"
				buttons={[
					{
						text: `Open on ${series ? providerLabel(series.provider) : "website"}`,
						icon: openOutline,
						handler: () => {
							if (book.chapterSourceUrl) void Browser.open({ url: book.chapterSourceUrl });
						},
					},
					{ text: "Cancel", role: "cancel" as const },
				]}
			/>

			{/* ── Merged annotations sheet (Contents / Highlights / Glossary) ── */}
			<AnnotationsSheet
				isOpen={annotationsOpen}
				onClose={() => setAnnotationsOpen(false)}
				theme={theme}
				chapters={chapters}
				onJumpChapter={handleChapterJump}
				seriesId={book.seriesId ?? null}
				highlights={highlightRows}
				content={content ?? ""}
				onJumpHighlight={jumpToOffset}
				glossary={glossaryEntries}
				currentBookId={id}
				onOpenEntry={(entry) => {
					setAnnotationsOpen(false);
					setEditingGlossaryEntry(entry);
				}}
				onAddEntry={handleAddEntryFromSheet}
			/>

			{/* ── Glossary entry modal ── */}
			<GlossaryEntryModal
				entry={editingGlossaryEntry}
				currentBookId={id}
				firstMentionContext={editingMentionContext}
				onClose={handleGlossaryModalClose}
				onSave={handleGlossarySave}
				onDelete={handleGlossaryDelete}
				onJumpFirst={handleJumpFirstMention}
				onJumpNext={handleJumpNextMention}
				theme={theme}
			/>

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
				onClose={closeDictionaryModal}
				onSearch={handleDictSearch}
				onAddToGlossary={handleAddWordToGlossary}
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
