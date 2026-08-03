/**
 * BookReader: state owner for the in-app book reader. Owns data queries,
 * mode state (scroll | page | rsvp), current word position, chapters,
 * selection + scrub hooks, and all overlay modals. Dispatches rendering
 * to a sibling view component (ScrollView, PageView, RsvpView).
 *
 * Position model is word units end-to-end. `paragraphOffsets` (bytes) stays
 * for string-edge ops (paragraph entry slicing, glossary regex matching).
 * The legacy single-book ESP32 still speaks bytes on BLE; conversion lives
 * in book-sync-context.tsx.
 */

import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import type { RsvpSettings } from "@lesefluss/core";
import {
	DEFAULT_SETTINGS,
	paragraphIndexForWord,
	utf8ByteLength,
	utf8ByteLengthOfCodePoint,
	type WordPosition,
	wordPos,
} from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@lesefluss/ui/drawer";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@lesefluss/ui/dropdown-menu";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import {
	Bookmark,
	ChevronLeft,
	ChevronRight,
	ExternalLink,
	Info,
	Loader2,
	MoreVertical,
	Search,
	Type,
	Zap,
	ZapOff,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "../../components/toast";
import { useBLE } from "../../contexts/ble-context";
import { useBookSync } from "../../contexts/book-sync-context";
import { useSyncContext } from "../../contexts/sync-context";
import { useTheme } from "../../contexts/theme-context";
import { useAutoSaveSettings } from "../../hooks/use-auto-save-settings";
import { externalSourceUrl } from "../../services/catalog/client";
import { queryHooks } from "../../services/db/hooks";
import { bookKeys, serialKeys } from "../../services/db/hooks/query-keys";
import { queries } from "../../services/db/queries";
import type { SeriesActivity } from "../../services/db/queries/series";
import type { Book, Chapter, GlossaryEntry } from "../../services/db/schema";
import { providerLabel } from "../../services/serial-scrapers";
import { DEFAULT_RSVP_DELIVERED_RATIO } from "../../services/stats/aggregate";
import { pushSync, scheduleSyncPush } from "../../services/sync";
import { reportEvent } from "../../services/telemetry";
import { publishLinkOpen, publishPositionSave, publishProgressWord } from "../../test-hooks/reader";
import { AVERAGE_READER_WPM, formatReadingTime } from "../../utils/reading-time";
import { setJustRead } from "../library/just-read-pin";
import AnnotationsSheet from "./annotations-sheet";
import AppearancePopover from "./appearance-popover";
import { useChapterAutoAdvance } from "./chapter-auto-advance";
import { useChapterFetch } from "./chapter-fetch";
import { buildChapterHeadingMap } from "./chapter-headings";
import { ChapterStateOverlay } from "./chapter-state-overlay";
import DictionaryModal from "./dictionary-modal";
import { colorFromLabel } from "./glossary-avatar";
import GlossaryEntryModal from "./glossary-entry-modal";
import { generateGlossaryId, normalizeGlossaryLabel } from "./glossary-utils";
import HighlightModal from "./highlight-modal";
import { NextChapterFooter } from "./next-chapter-footer";
import PageView from "./page-view";
import type { ParagraphWordEntry } from "./paragraph";
import {
	clearPendingPosition,
	type PendingPosition,
	readPendingPosition,
	recoverPendingWord,
	writePendingPosition,
} from "./pending-position";
import { stripPunct } from "./rsvp-engine";
import RsvpView, { type RsvpViewHandle } from "./rsvp-view";
import ScrollView, { ReaderSkeleton } from "./scroll-view";
import SearchModal from "./search-modal";
import SelectionOverlay from "./selection-overlay";
import { SessionDebugBadge } from "./session-debug-badge";
import { SessionPauseOverlay } from "./session-pause-overlay";
import { createTwoFingerTapDetector } from "./two-finger-tap";
import {
	findFirstMention,
	findNextMention,
	getMentionContext,
	useGlossaryDecorations,
} from "./use-glossary-decorations";
import { useHighlightSelection } from "./use-highlight-selection";
import { useKeyboardShortcuts } from "./use-keyboard-shortcuts";
import { useLinkDecorations } from "./use-link-decorations";
import { type ReadingSessionMode, useReadingSession } from "./use-reading-session";
import { useScrubProgress } from "./use-scrub-progress";
import type { ReaderViewHandle } from "./view-types";

// ─── Module-level singletons ─────────────────────────────────────────────────
const _encoder = new TextEncoder();

// Sentinel value: no word highlighted (while scrolling)
const NO_HIGHLIGHT = -1;

// A position write that hasn't settled in this long is treated as wedged/stalled
// and reported as diagnostics (see savePosition).
const POSITION_WRITE_TIMEOUT_MS = 8000;

// Throttle the user-facing "couldn't save" toast so a write that fails on every
// attempt can't spam a toast on every scroll settle.
const SAVE_ERROR_TOAST_THROTTLE_MS = 120_000;
let lastSaveErrorToastAt = 0;
function notifyLocalSaveFailure() {
	const now = Date.now();
	if (now - lastSaveErrorToastAt < SAVE_ERROR_TOAST_THROTTLE_MS) return;
	lastSaveErrorToastAt = now;
	toast.error("Couldn't save your reading progress on this device. Try restarting the app.", {
		duration: 6000,
	});
}

// ─── Main page ───────────────────────────────────────────────────────────────

const BookReader: React.FC<{ id: string }> = ({ id }) => {
	const { pushPosition, onDevicePositionUpdate } = useBookSync();
	const { isConnected: isBleConnected } = useBLE();
	const { isSyncing } = useSyncContext();
	const qc = useQueryClient();
	const history = useRouter().history;

	// ── Data queries ──────────────────────────────────────────────────────
	const { data: book, isPending: bookPending } = queryHooks.useBook(id);
	const readingRates = queryHooks.useStatsReadingRates();
	const { data: contentRow, isPending: contentPending } = queryHooks.useBookContent(id);
	const { data: wordIndex } = queryHooks.useBookWordIndex(id);
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

	const [activeWord, setActiveWord] = useState(0);
	const [progressWord, setProgressWord] = useState(0);
	// Updated only on genuine user seeks (entering RSVP, scrubbing). Skipping
	// `onPositionChange` writes here prevents an echo that would pause playback.
	const [rsvpInitWord, setRsvpInitWord] = useState(0);

	// Progress bar visibility - shown on tap/word-tap, hidden when user scrolls
	const [progressBarVisible, setProgressBarVisible] = useState(false);
	// Mirror of progressBarVisible accessible from refs-only callbacks. Lets
	// per-scroll-tick handlers skip setProgressWord when the bar is hidden,
	// removing the React reconciliation cost during hold-scroll.
	const progressBarVisibleRef = useRef(false);
	useEffect(() => {
		progressBarVisibleRef.current = progressBarVisible;
	}, [progressBarVisible]);
	// Latest progress word, written every scroll tick. setProgressWord
	// (state) only flushed when the bar becomes visible or on scroll settle.
	const progressWordRef = useRef(0);
	// Keep ref in sync with state so other call sites (jumps, scrubs, init seed)
	// don't need to write the ref explicitly. Skip during the per-tick hidden
	// phase since the ref is the authoritative writer there.
	useEffect(() => {
		progressWordRef.current = progressWord;
		if (import.meta.env.DEV) publishProgressWord(progressWord);
	}, [progressWord]);

	const scrollViewRef = useRef<ReaderViewHandle>(null);
	const rsvpViewRef = useRef<RsvpViewHandle>(null);

	// Manual session pause (two-finger tap). Feeds !isSessionPaused into the
	// session hook's isReading, so the clock settles instantly via the
	// tracker's existing setReading path.
	const [isSessionPaused, setIsSessionPaused] = useState(false);
	const isSessionPausedRef = useRef(isSessionPaused);
	isSessionPausedRef.current = isSessionPaused;
	// Callback-ref state, not a ref: the pending/not-found early returns render
	// without the container, so an empty-deps effect would read null once and
	// the gesture would never attach on a cold (uncached) open.
	const [viewContainerEl, setViewContainerEl] = useState<HTMLDivElement | null>(null);

	// Track the last word we set so we can flush on unmount.
	// null = not yet loaded from DB, don't overwrite on unmount.
	const lastWordRef = useRef<number | null>(null);
	// Flips true the first time the user actually moves position (scroll
	// settle, word tap, jump, RSVP, scrub). Gates the unmount-flush so a
	// brief re-mount (tanstack route transition double-render) whose seed
	// effect re-populates `lastOffsetRef.current` from a stale `book.position`
	// query-cache value doesn't write that stale value back over the real
	// position written by the prior unmount.
	const userMovedRef = useRef(false);
	// The word this mount resumed at (set by the seed effect). Used only for
	// diagnostics: on teardown, a position that differs from this but is being
	// SKIPPED (userMovedRef false) is a candidate "lost on back/quit" save.
	const seededWordRef = useRef<number | null>(null);
	// Timestamp of the last programmatic jump (TOC click, highlight nav, search
	// jump, etc.). The scroll view's `onPositionSettle` fires shortly after a
	// jump as the virtual list reconciles its scroll target; that settle's
	// reported word is the viewport-top word, which can sit BEFORE the jumped
	// word. Gating settle saves within this window prevents the settle from
	// stomping a fresh jump position. 0 = no recent jump.
	const lastJumpAtRef = useRef(0);
	const JUMP_SETTLE_GUARD_MS = 1500;

	// Guards the seed effect below so it only runs once on initial load.
	// book is a new object reference on every BLE position sync (query
	// invalidation), so without this guard setRsvpInitOffset would fire
	// mid-playback and pause the RSVP reader.
	const didSeedOffsetsRef = useRef(false);

	const didSeedModeRef = useRef(false);

	// Carries a position recovered from the durable localStorage fallback so a
	// later effect can persist it to the DB once `savePosition` is in scope.
	// null = nothing to recover.
	const pendingRecoveredRef = useRef<number | null>(null);

	// Snapshot the durable fallback ONCE per book, during render, before any
	// save in this session (e.g. a reload-time init-scroll settle) can overwrite
	// the localStorage entry. The reconcile reads this snapshot, so it can only
	// ever recover the PREVIOUS session's orphaned write, never this mount's own.
	const pendingSnapshotRef = useRef<{ id: string; value: PendingPosition | null } | null>(null);
	if (pendingSnapshotRef.current?.id !== id) {
		pendingSnapshotRef.current = { id, value: readPendingPosition(id) };
	}

	// MUST run before the seed effect: on first mount both effects fire in
	// declaration order, and a reset after seed would null lastWordRef back
	// out, letting a fast RSVP toggle overwrite the saved position with 0.
	useEffect(() => {
		void id;
		didSeedOffsetsRef.current = false;
		didSeedModeRef.current = false;
		lastWordRef.current = null;
		seededWordRef.current = null;
		userMovedRef.current = false;
	}, [id]);

	const seedWord = book?.wordPosition ?? null;
	const seedLastRead = book?.lastRead ?? 0;

	useEffect(() => {
		if (didSeedOffsetsRef.current || seedWord === null) return;
		didSeedOffsetsRef.current = true;

		// Durable-resume reconcile: a teardown may have left a synchronously
		// persisted position whose async DB write never committed. Prefer it
		// ONLY when strictly newer than the row's lastRead, so a committed save
		// or a cloud-synced position from another device always wins. Hand the
		// recovered word to the persist effect below (we do NOT set userMovedRef
		// here. That flag gates the unmount flush against the transient-remount
		// clobber, and seeding is not a user move). Consume the entry either way.
		let resolved = seedWord;
		const pending = pendingSnapshotRef.current?.value ?? null;
		const recovered = recoverPendingWord(seedWord, seedLastRead, pending);
		if (recovered !== null) {
			resolved = wordPos(recovered);
			pendingRecoveredRef.current = resolved;
		}
		clearPendingPosition(id);

		setActiveWord(resolved);
		setProgressWord(resolved);
		setRsvpInitWord(resolved);
		lastWordRef.current = resolved;
		seededWordRef.current = resolved;
	}, [seedWord, seedLastRead, id]);

	// Live-seek when the device pushes a new position for this book over BLE.
	// book-sync-context applies the conflict-resolution tolerance gate first,
	// so we only see notifies the user should visibly follow. Gated on
	// isBleConnected so a user who never pairs pays nothing. We mirror what
	// jumpToWord does (state + scroll) but skip savePosition/pushPosition:
	// the DB row was already updated by applyDevicePosition, and pushing back
	// to the device would echo the value it just sent us.
	useEffect(() => {
		if (!isBleConnected) return;
		const unsubscribe = onDevicePositionUpdate((bookId, newWordPosition) => {
			if (bookId !== id) return;
			const totalWords = wordIndex?.wordCount ?? book?.wordCount ?? 0;
			// Without a known upper bound a malformed notify would persist a
			// huge word index via the unmount-flush.
			if (totalWords === 0) return;
			if (newWordPosition < 0 || newWordPosition >= totalWords) return;
			setActiveWord(newWordPosition);
			setProgressWord(newWordPosition);
			setRsvpInitWord(newWordPosition);
			lastWordRef.current = newWordPosition;
			// Stops the unmount-flush from overwriting the device's fresh
			// position with a stale seed during a route re-mount.
			userMovedRef.current = true;
			scrollViewRef.current?.jumpTo(newWordPosition, {
				highlight: true,
				fine: true,
				smooth: true,
			});
		});
		return unsubscribe;
	}, [id, wordIndex?.wordCount, book?.wordCount, isBleConnected, onDevicePositionUpdate]);

	// ── Build paragraph index ──────────────────────────────────────────────
	// Computed once per content load. Two cheap structures:
	//   paragraphs[i]       - the text of paragraph i
	//   paragraphOffsets[i] - UTF-8 byte offset of paragraph i's first character
	//
	// We must use UTF-8 byte lengths (not JS .length) because the ESP32 tracks
	// position as a byte offset into book.txt. For any multi-byte character
	// (smart quotes, em-dashes, accented letters) the two diverge.
	const { paragraphs, paragraphOffsets, contentByteLength } = useMemo(() => {
		if (!content) return { paragraphs: [], paragraphOffsets: [], contentByteLength: 0 };

		const paras = content.split("\n\n");
		const offsets: number[] = new Array(paras.length);
		let offset = 0;
		for (let i = 0; i < paras.length; i++) {
			offsets[i] = offset;
			offset += utf8ByteLength(paras[i]) + 2; // +2 for the "\n\n" separator (always 2 UTF-8 bytes)
		}
		return { paragraphs: paras, paragraphOffsets: offsets, contentByteLength: offset - 2 };
	}, [content]);

	const paragraphStartWords = useMemo(() => {
		if (!wordIndex) return paragraphOffsets.map(() => 0);
		return paragraphOffsets.map((b) => wordIndex.wordOf(b));
	}, [paragraphOffsets, wordIndex]);

	// Per-paragraph slice of canonical WordIndex entries with paragraph-local
	// char offsets. The Paragraph component renders one span per entry with
	// `data-word=entry.wordIndex`, so DOM word indices are always the canonical
	// ones from the WordIndex.
	const entriesByParagraph = useMemo<ParagraphWordEntry[][]>(() => {
		if (!wordIndex || paragraphs.length === 0) return paragraphs.map(() => []);
		const all = wordIndex.listEntries();
		const result: ParagraphWordEntry[][] = new Array(paragraphs.length);
		let cursor = 0;
		for (let p = 0; p < paragraphs.length; p++) {
			const paraText = paragraphs[p];
			const paraByteStart = paragraphOffsets[p];
			// Paragraph end byte = next paragraph's start minus the "\n\n" separator,
			// or the content byte length for the last paragraph. Avoids an extra
			// O(n) UTF-8 scan per paragraph.
			const paraByteEnd =
				p + 1 < paragraphOffsets.length ? paragraphOffsets[p + 1] - 2 : contentByteLength;

			while (cursor < all.length && all[cursor].byteOffset < paraByteStart) cursor++;
			let end = cursor;
			while (end < all.length && all[end].byteOffset < paraByteEnd) end++;

			const items: ParagraphWordEntry[] = [];
			let i = 0;
			let b = paraByteStart;
			for (let k = cursor; k < end; k++) {
				const entry = all[k];
				while (b < entry.byteOffset && i < paraText.length) {
					const cp = paraText.codePointAt(i) ?? 0;
					b += utf8ByteLengthOfCodePoint(cp);
					i += cp >= 0x10000 ? 2 : 1;
				}
				const charStart = i;
				const nextByte = k + 1 < end ? all[k + 1].byteOffset : paraByteEnd;
				while (b < nextByte && i < paraText.length) {
					const cp = paraText.codePointAt(i) ?? 0;
					b += utf8ByteLengthOfCodePoint(cp);
					i += cp >= 0x10000 ? 2 : 1;
				}
				items.push({ charStart, charEnd: i, wordIndex: wordPos(k) });
			}
			result[p] = items;
			cursor = end;
		}
		return result;
	}, [paragraphs, paragraphOffsets, contentByteLength, wordIndex]);

	// ── Parse chapters ────────────────────────────────────────────────────
	const chapters = useMemo<Chapter[]>(() => {
		if (!contentRow?.chapters) return [];
		try {
			return JSON.parse(contentRow.chapters) as Chapter[];
		} catch {
			return [];
		}
	}, [contentRow?.chapters]);

	// Chapter titles to render inline as headers. Older imports (and EPUBs whose
	// chapter titles were images) have no heading in `content` at the chapter
	// start, so a TOC jump shows no header. Fall back to the stored TOC title,
	// keyed by the paragraph the chapter starts in. Skipped when the chapter's
	// first paragraph already carries a heading (real <h1>-<h6> or an importer-
	// injected "# " line) so headers never double up.
	const chapterHeadingByParagraph = useMemo(
		() => buildChapterHeadingMap(chapters, paragraphs, paragraphStartWords),
		[chapters, paragraphs, paragraphStartWords],
	);

	// ── Reading time estimation ───────────────────────────────────────────
	const contentBytes = useMemo(() => (content ? _encoder.encode(content) : null), [content]);

	const totalWordCount = book?.wordCount ?? wordIndex?.wordCount ?? 0;

	const chapterWordCounts = useMemo(() => {
		if (!chapters.length) return [];
		const totalWords = book?.wordCount ?? wordIndex?.wordCount ?? 0;
		return chapters.map((ch, i) => {
			const nextStart = chapters[i + 1]?.startWord ?? totalWords;
			return Math.max(0, nextStart - ch.startWord);
		});
	}, [chapters, book?.wordCount, wordIndex?.wordCount]);

	const currentChapterIndex = useMemo(() => {
		if (!chapters.length) return -1;
		for (let i = chapters.length - 1; i >= 0; i--) {
			if (progressWord >= chapters[i].startWord) return i;
		}
		return 0;
	}, [progressWord, chapters]);

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
			focalLetterColor: dbSettings?.focalLetterColor ?? DEFAULT_SETTINGS.FOCAL_LETTER_COLOR,
		}),
		[dbSettings],
	);

	// ── Save position to DB + BLE ─────────────────────────────────────────
	const savePosition = useCallback(
		async (word: number, { scheduleSync = true }: { scheduleSync?: boolean } = {}) => {
			const now = Date.now();
			const wordPosition = wordPos(word);
			const update: { lastRead: number; wordPosition: WordPosition } = {
				lastRead: now,
				wordPosition,
			};

			// Durable fallback: mirror the position to localStorage synchronously
			// BEFORE the async DB write, stamped with the same `now` that becomes
			// the row's lastRead. If a teardown abandons the write below, this
			// survives and the next mount recovers it; if the write commits, we
			// clear it just after so a stale entry never outlives a real save.
			writePendingPosition(id, word, now);

			// Optimistic cache update so the library lands already-sorted when
			// the user navigates back, instead of shifting under their finger
			// after the async refetch finishes.
			const seriesId = book?.seriesId ?? null;
			qc.setQueryData<{ books: Book[]; covers: Map<string, string> } | undefined>(
				bookKeys.all,
				(prev) => {
					if (!prev) return prev;
					let changed = false;
					const next = prev.books.map((b) => {
						if (b.id !== id) return b;
						changed = true;
						return { ...b, wordPosition, lastRead: now };
					});
					return changed ? { ...prev, books: next } : prev;
				},
			);
			if (seriesId) {
				qc.setQueryData<Map<string, SeriesActivity> | undefined>(serialKeys.activity, (prev) => {
					if (!prev) return prev;
					const current = prev.get(seriesId);
					if (!current) return prev;
					const merged = new Map(prev);
					merged.set(seriesId, {
						...current,
						latestRead: Math.max(current.latestRead ?? 0, now),
					});
					return merged;
				});
			}
			setJustRead(seriesId ? `series:${seriesId}` : `book:${id}`);

			// Watchdog: a wedged write queue or a stalled native bridge makes the
			// write hang without ever rejecting, so the adapter's error path can't
			// see it. If the write hasn't settled in time, report it as a likely
			// cause of "progress never saves" and leave the durable fallback intact.
			let settled = false;
			const watchdog = setTimeout(() => {
				if (!settled) {
					reportEvent("position_write_timeout");
					notifyLocalSaveFailure();
				}
			}, POSITION_WRITE_TIMEOUT_MS);
			try {
				await queries.updateBook(id, update);
			} catch {
				// The adapter already reports the underlying db_write_error. Tell the
				// user it didn't save so they know it's not intended, keep the
				// synchronous fallback (do NOT clear it) so the next mount can recover,
				// and skip the post-commit steps below.
				notifyLocalSaveFailure();
				return;
			} finally {
				settled = true;
				clearTimeout(watchdog);
			}
			// The row is now durable; drop the synchronous fallback so it can't
			// later be mistaken for an uncommitted write on the next mount.
			clearPendingPosition(id);
			await pushPosition(id, word);
			if (scheduleSync) scheduleSyncPush(5000);
			if (import.meta.env.DEV) publishPositionSave(id, word);
		},
		[id, pushPosition, book?.seriesId, qc],
	);

	// Persist a position recovered from the durable fallback (set by the seed
	// effect above) to the DB, so it survives forward even if the user never
	// moves before leaving again. `seedWord` is in the deps so this fires in the
	// same commit the seed effect ran (declaration order: seed first, this
	// second); later re-runs are no-ops once the ref is consumed.
	// biome-ignore lint/correctness/useExhaustiveDependencies: seedWord is an intentional trigger (same commit as the seed effect), not a value this body reads.
	useEffect(() => {
		const recovered = pendingRecoveredRef.current;
		if (recovered === null) return;
		pendingRecoveredRef.current = null;
		void savePosition(recovered);
	}, [seedWord, savePosition]);

	// ── Shared helpers ────────────────────────────────────────────────────
	const findParagraphIndexForWord = useCallback(
		(targetWord: number): number => paragraphIndexForWord(paragraphStartWords, targetWord),
		[paragraphStartWords],
	);

	/** Update parent state for a programmatic position change, then delegate the
	 *  visual scroll to whichever view is mounted. */
	const jumpToWord = useCallback(
		(word: number, { highlight = true }: { highlight?: boolean } = {}) => {
			setActiveWord(word);
			setProgressWord(word);
			lastWordRef.current = word;
			userMovedRef.current = true;
			lastJumpAtRef.current = Date.now();
			savePosition(word);
			scrollViewRef.current?.jumpTo(word, { highlight });
		},
		[savePosition],
	);

	// ── Highlight / selection state ──────────────────────────────────────
	const sel = useHighlightSelection({
		bookId: id,
		contentBytes,
		highlightRows,
		paragraphStartWords,
		totalWords: totalWordCount,
		wordIndex,
	});

	// ── Glossary inline-underline decorations ──────────────────────────────
	const glossaryByParagraph = useGlossaryDecorations({
		entries: glossaryEntries,
		paragraphs,
		paragraphOffsets,
		enabled: readerGlossaryUnderline,
		wordIndex: wordIndex ?? null,
	});

	/** Find any glossary range covering this word index (used by tap handlers). */
	const findGlossaryAt = useCallback(
		(wordIdx: number): GlossaryEntry | undefined => {
			for (const ranges of glossaryByParagraph.values()) {
				for (const r of ranges) {
					if (wordIdx >= r.startWord && wordIdx <= r.endWord) {
						return glossaryEntries.find((e) => e.id === r.entryId);
					}
				}
			}
			return undefined;
		},
		[glossaryByParagraph, glossaryEntries],
	);

	// ── External hyperlink decorations ─────────────────────────────────────
	const storedLinks = useMemo(
		() => queries.parseLinkRanges(contentRow?.linkRanges ?? null),
		[contentRow?.linkRanges],
	);
	const linksByParagraph = useLinkDecorations({
		storedLinks,
		paragraphs,
		paragraphOffsets,
		paragraphStartWords,
		wordIndex: wordIndex ?? null,
	});

	/** Find the href of any link range covering this word index. */
	const findLinkAt = useCallback(
		(wordIdx: number): string | undefined => {
			for (const ranges of linksByParagraph.values()) {
				for (const r of ranges) {
					if (wordIdx >= r.startWord && wordIdx <= r.endWord) return r.href;
				}
			}
			return undefined;
		},
		[linksByParagraph],
	);

	const handleLinkTap = useCallback((href: string) => {
		if (import.meta.env.DEV) publishLinkOpen(href);
		void Browser.open({ url: href });
	}, []);

	// ── Progress-bar scrub gestures ───────────────────────────────────────
	const scrub = useScrubProgress({
		book,
		readerMode,
		totalWords: totalWordCount,
		paragraphStartWords,
		findParagraphIndexForWord,
		jumpToWord,
		savePosition,
		lastWordRef,
		setProgressWord,
		setRsvpInitWord,
		setProgressBarVisible,
	});

	// ── ScrollView callbacks ──────────────────────────────────────────────
	const { isSelecting, syncHandlesRef } = sel;
	const { isScrubbingRef } = scrub;

	// Forward-declared activity callback. `useReadingSession` (called later in
	// the component) assigns into this ref so handlers above the hook can call
	// it without circular reference. Stays null until the hook mounts; safely
	// noop during the first render.
	const markActivityRef = useRef<(() => void) | null>(null);

	const handleScrollPositionSettle = useCallback(
		(word: number) => {
			// Always restore the underline. Skip the save/lastRead bump when
			// the word didn't actually change so opening a book or scrolling
			// back to the same position doesn't mark it as updated.
			setActiveWord(word);
			setProgressWord(word);
			if (lastWordRef.current === word) return;
			// Reject settle events fired by the virtual list reconciling a fresh
			// jump's scroll target. Within JUMP_SETTLE_GUARD_MS of jumpToWord,
			// the settle word is the viewport-top, which sits BEFORE the jumped
			// chapter heading; writing it would silently rewind the user's
			// just-set position.
			if (Date.now() - lastJumpAtRef.current < JUMP_SETTLE_GUARD_MS) return;
			lastWordRef.current = word;
			userMovedRef.current = true;
			savePosition(word);
			markActivityRef.current?.();
			// End-of-book chapter advance. Settle must hit the literal last
			// word; the `wordCount > 32` guard mirrors the prior 32-byte
			// safety floor so freshly-fetched short chapters (wordCount
			// momentarily 0, or one-word stubs) don't auto-advance the
			// instant they mount. No-op for non-serials inside `tryAdvance`.
			const totalWords = book?.wordCount ?? 0;
			if (totalWords > 32 && word >= totalWords - 1) {
				void chapterAdvance.tryAdvance();
			}
		},
		[savePosition, chapterAdvance, book?.wordCount],
	);

	const handleScrollHighlightClear = useCallback(() => {
		setActiveWord((prev) => (prev === NO_HIGHLIGHT ? prev : NO_HIGHLIGHT));
	}, []);

	const handleScrollHideProgressBar = useCallback(() => setProgressBarVisible(false), []);
	const handleScrollShowProgressBar = useCallback(() => {
		setProgressBarVisible(true);
		// Flush the latest word accumulated while the bar was hidden so it
		// reflects the current scroll position the moment it appears.
		setProgressWord(progressWordRef.current);
		markActivityRef.current?.();
	}, []);
	const handleSetActiveWord = useCallback((word: number) => setActiveWord(word), []);
	const handleSetProgressWord = useCallback((word: number) => {
		progressWordRef.current = word;
		// Track per-tick so a paginationStyle toggle mid-scroll seeds the next
		// view from the user's current visual position rather than the last
		// settled word (which may be from before the in-flight scroll). But
		// within the post-jump guard window the scroll is still animating toward
		// the jump target, so its intermediate words must not overwrite the saved
		// position (same guard as handleScrollPositionSettle). Without it, a flush
		// mid-jump-scroll would persist a transient word instead of the jump
		// target, and the durable fallback would even resurrect it.
		if (Date.now() - lastJumpAtRef.current >= JUMP_SETTLE_GUARD_MS) {
			lastWordRef.current = word;
			userMovedRef.current = true;
		}
		// Skip state update when bar is hidden: nothing in the visible UI
		// depends on progressWord, and the per-tick reconciliation was the
		// dominant scripting cost during hold-scroll. handleScrollPositionSettle
		// (scroll-end) writes the final value to state.
		if (progressBarVisibleRef.current) setProgressWord(word);
		markActivityRef.current?.();
	}, []);

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
		(wIdx: number, wordText: string) => {
			if (isSelecting) {
				cancelSelection();
				return;
			}

			const href = findLinkAt(wIdx);
			if (href) {
				handleLinkTap(href);
				return;
			}

			if (wIdx === activeWord) {
				const existing = findHighlightAt(wIdx);
				if (existing) {
					openHighlightEditor(existing);
					return;
				}
				const glossary = findGlossaryAt(wIdx);
				if (glossary) {
					setEditingGlossaryEntry(glossary);
					return;
				}
				const original = stripPunct(wordText);
				const clean = original.toLowerCase();
				if (clean) openDictionaryModal(clean, original);
				return;
			}
			setActiveWord(wIdx);
			setProgressWord(wIdx);
			setProgressBarVisible(true);
			lastWordRef.current = wIdx;
			userMovedRef.current = true;
			savePosition(wIdx);
		},
		[
			savePosition,
			activeWord,
			isSelecting,
			cancelSelection,
			findHighlightAt,
			openHighlightEditor,
			findGlossaryAt,
			findLinkAt,
			handleLinkTap,
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
	// straight from the DOM (selection.startWord targets a word span via
	// `data-word`) and opens the dictionary modal.
	const handleSelectionLookup = useCallback(() => {
		const range = sel.selectionRange;
		if (!range) return;
		const span = document.querySelector<HTMLElement>(`span[data-word="${range.startWord}"]`);
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
			// Strip surrounding punctuation so a selection like "pause." or `"Harmony"`
			// becomes the clean label "pause" / "Harmony".
			const trimmed = normalizeGlossaryLabel(snippet);
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
		const snippet = sel.extractRangeText(range.startWord, range.endWord).trim();
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
			const wordIdx = findFirstMention(label, paragraphs, paragraphOffsets, wordIndex ?? null);
			if (wordIdx !== null) jumpToWord(wordIdx);
		},
		[paragraphs, paragraphOffsets, jumpToWord, wordIndex],
	);

	const handleJumpNextMention = useCallback(
		(label: string) => {
			const wordIdx = findNextMention(
				label,
				activeWord,
				paragraphs,
				paragraphOffsets,
				wordIndex ?? null,
			);
			if (wordIdx !== null) jumpToWord(wordIdx);
		},
		[paragraphs, paragraphOffsets, jumpToWord, activeWord, wordIndex],
	);

	// ── Mouse drag-to-select ──────────────────────────────────────────────
	// Desktop equivalent of long-press: pointerdown on a word + mousemove > 8px
	// starts selection mode. We then track the mouse across word spans until
	// mouseup to extend the selection range. The synthetic click that follows
	// mouseup is swallowed so it doesn't cancel the fresh selection via
	// handleWordTap.
	const { startSelection, extendSelectionTo, startHandleRef, endHandleRef } = sel;
	const handleWordMouseDragStart = useCallback(
		(wIdx: number, initialEvent: PointerEvent) => {
			const existing = findHighlightAt(wIdx);
			if (existing) {
				openHighlightEditor(existing);
				return;
			}
			startSelection(wIdx);
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
				const span = el?.closest<HTMLElement>("span[data-word]");
				if (!span) return;
				const wIdx = Number.parseInt(span.dataset.word ?? "", 10);
				if (Number.isNaN(wIdx)) return;
				extendSelectionTo(wIdx);
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
		(word: number) => {
			setProgressWord(word);
			lastWordRef.current = word;
			userMovedRef.current = true;
			savePosition(word, { scheduleSync: false });
			markActivityRef.current?.();
		},
		[savePosition],
	);

	/** Switch from RSVP back to the standard reader, positioning the
	 *  next-mounted view at the given word (consumed via initialWord on
	 *  remount). The actual scroll-vs-page choice happens at render time
	 *  based on paginationStyle. */
	const exitRsvpToStandard = useCallback(
		(word: number) => {
			lastWordRef.current = word;
			userMovedRef.current = true;
			setProgressWord(word);
			setReaderMode("standard");
			savePosition(word);
		},
		[savePosition],
	);

	const handleRsvpToggle = useCallback(() => {
		if (readerMode !== "rsvp") {
			// Use lastWordRef (word-level accurate from handleScrollEnd)
			// instead of progressWord (paragraph-level from handleScroll).
			const word = lastWordRef.current ?? 0;
			setProgressWord(word);
			setRsvpInitWord(word);
			setReaderMode("rsvp");
			setProgressBarVisible(true);
		} else {
			exitRsvpToStandard(lastWordRef.current ?? 0);
		}
	}, [readerMode, exitRsvpToStandard]);

	const handleRsvpFinished = useCallback(() => {
		exitRsvpToStandard(lastWordRef.current ?? 0);
		// No-op for standalone books; navigates to next chapter for serials.
		void chapterAdvance.tryAdvance();
	}, [exitRsvpToStandard, chapterAdvance]);

	const handleRsvpWpmChange = useCallback(
		(wpm: number) => updateSetting("wpm", wpm),
		[updateSetting],
	);

	// ── Chapter jump ──────────────────────────────────────────────────────
	const handleChapterJump = useCallback(
		(startWord: number) => {
			if (readerMode === "rsvp") {
				exitRsvpToStandard(startWord);
			} else {
				jumpToWord(startWord);
			}
		},
		[readerMode, jumpToWord, exitRsvpToStandard],
	);

	const handleHighlightJump = useCallback(
		(h: { startWord: number }) => {
			jumpToWord(h.startWord);
		},
		[jumpToWord],
	);

	// ── Search jump ───────────────────────────────────────────────────────────
	// The search modal gives us a JS char offset (indexOf result). String-edge
	// case: convert char → byte → word via WordIndex before handing off.
	const handleSearchJump = useCallback(
		(charOffset: number) => {
			if (!content || !wordIndex) return;
			const byteOffset = utf8ByteLength(content.slice(0, charOffset));
			const word = wordIndex.wordOf(byteOffset);

			if (readerMode === "rsvp") {
				setActiveWord(word);
				exitRsvpToStandard(word);
			} else {
				jumpToWord(word);
			}
		},
		[content, readerMode, jumpToWord, exitRsvpToStandard, wordIndex],
	);

	// ── Keyboard shortcuts ────────────────────────────────────────────────
	useKeyboardShortcuts({
		readerMode,
		paginationStyle,
		currentWpm: rsvpSettings.wpm,
		isBlocked:
			selectedWord !== null ||
			annotationsOpen ||
			searchOpen ||
			sel.isSelecting ||
			editingGlossaryEntry !== null ||
			sel.editingHighlight !== null ||
			sel.noteInputOpen,
		scrollViewRef,
		rsvpViewRef,
		lastOffsetRef: lastWordRef,
		handleRsvpToggle,
		exitRsvpToStandard,
	});

	// ── Reading session tracking ──────────────────────────────────────────
	// `isReading` is the coarse "reader page is mounted with content". The
	// hook subscribes visibility + Capacitor App state itself for pause/resume;
	// `markActivity` is fed from scroll/page/RSVP callbacks so long-paragraph
	// reading (no position change for minutes) doesn't trigger spurious idle.
	const sessionMode: ReadingSessionMode =
		readerMode === "rsvp" ? "rsvp" : paginationStyle === "page" ? "page" : "scroll";
	const getReadingPosition = useCallback(() => lastWordRef.current ?? 0, []);
	const { markActivity: markReadingActivity, getDebugSnapshot } = useReadingSession({
		bookId: id,
		mode: sessionMode,
		isReading: !!content && lastWordRef.current !== null && !isSessionPaused,
		getPosition: getReadingPosition,
		wpmSetting: rsvpSettings.wpm,
	});
	useEffect(() => {
		markActivityRef.current = markReadingActivity;
	}, [markReadingActivity]);

	// A book or mode change tears down the tracker (new sitting); a stale
	// manual pause must not carry over into it.
	useEffect(() => {
		setIsSessionPaused(false);
	}, [id, sessionMode]);

	// Two-finger tap anywhere in the view container toggles the manual pause.
	// Native listeners (passive) because the container hosts three different
	// view components; the detector is pure and unit-tested. Progress-bar
	// touches never arm the gesture — a clumsy two-finger scrub is a scrub.
	// While paused the overlay's pointer capture only stops React pointer
	// events, so the container's native touch listeners still see the resume
	// tap.
	const selIsSelectingRef = useRef(sel.isSelecting);
	selIsSelectingRef.current = sel.isSelecting;
	const readerModeRef = useRef(readerMode);
	readerModeRef.current = readerMode;
	useEffect(() => {
		const el = viewContainerEl;
		if (!el) return;
		const detector = createTwoFingerTapDetector(() => {
			if (selIsSelectingRef.current) return;
			if (isSessionPausedRef.current) {
				setIsSessionPaused(false);
				return;
			}
			setIsSessionPaused(true);
			if (readerModeRef.current === "rsvp") rsvpViewRef.current?.pause();
		});
		const onTouchStart = (e: TouchEvent) => {
			const target = e.target as HTMLElement | null;
			if (target?.closest(".reader-progress-bar, .selection-handle")) {
				detector.reset();
				return;
			}
			detector.touchstart(e);
		};
		const onTouchMove = (e: TouchEvent) => detector.touchmove(e);
		const onTouchEnd = (e: TouchEvent) => detector.touchend(e);
		const onTouchCancel = () => detector.touchcancel();
		el.addEventListener("touchstart", onTouchStart, { passive: true });
		el.addEventListener("touchmove", onTouchMove, { passive: true });
		el.addEventListener("touchend", onTouchEnd, { passive: true });
		el.addEventListener("touchcancel", onTouchCancel, { passive: true });
		return () => {
			el.removeEventListener("touchstart", onTouchStart);
			el.removeEventListener("touchmove", onTouchMove);
			el.removeEventListener("touchend", onTouchEnd);
			el.removeEventListener("touchcancel", onTouchCancel);
		};
	}, [viewContainerEl]);

	// ── Hide tab bar while reader is mounted ──────────────────────────────
	// Ionic's shadow DOM toggles tab-bar-hidden on keyboard show/hide, and
	// external CSS can't override :host styles reliably. A body class lets
	// us target ion-tab-bar from outside the shadow DOM with higher priority.
	// Stable ref so the unmount cleanup below doesn't re-run every render when
	// `sel` (a fresh object literal from useHighlightSelection) changes ref.
	// Re-running the cleanup mid-selection wiped the just-started selection,
	// which is why long-press appeared to flicker for ~50ms then vanish.
	const cancelSelectionRef = useRef(sel.cancelSelection);
	cancelSelectionRef.current = sel.cancelSelection;

	useEffect(() => {
		document.body.classList.add("reader-open");
		return () => {
			document.body.classList.remove("reader-open");
			// Drop any in-progress selection on unmount (back gesture, programmatic
			// nav). The selection toolbar/handles render via a portal on
			// document.body, so without this they'd stay pinned while the page
			// slides out and visibly flash over the next page.
			cancelSelectionRef.current();
		};
	}, []);

	// touch-action: none is applied directly to the handle elements via CSS
	// so the scroll container remains scrollable during selection mode.

	// ── Flush position on unmount ─────────────────────────────────────────
	// `savePosition` and `qc` are routed through refs so the effect cleanup
	// fires only on actual unmount — not every time `savePosition` recreates
	// (which happens on every BLE `isConnected` flicker).
	const savePositionRef = useRef(savePosition);
	savePositionRef.current = savePosition;
	const qcRef = useRef(qc);
	qcRef.current = qc;
	useEffect(() => {
		return () => {
			// Flush position to DB so the library shows updated progress.
			// Only write if the user actually moved the position. A brief
			// re-mount during the route transition seeds `lastWordRef` from
			// the (possibly-stale) `book.wordPosition` query cache; flushing
			// that would clobber the real value the prior unmount just wrote.
			const word = lastWordRef.current;
			if (word !== null && userMovedRef.current) {
				savePositionRef.current(word, { scheduleSync: false });
				pushSync().catch(() => {});
			} else if (
				word !== null &&
				seededWordRef.current !== null &&
				word !== seededWordRef.current
			) {
				// We moved away from the resumed position but the gated DB save was
				// skipped (userMovedRef false, e.g. a transient remount reset it).
				// Without this, the moved position reaches NEITHER the DB nor the
				// in-savePosition fallback and is lost on reopen. Mirror it to the
				// durable fallback directly; the timestamp-gated reconcile recovers it
				// next open and can't clobber a newer committed/synced value.
				writePendingPosition(id, word, Date.now());
				// Report it too so the field confirms this is the lost-progress path.
				reportEvent("position_flush_skipped", {
					extra: { origin: "unmount", word, seed: seededWordRef.current },
				});
			}
			// Invalidate the books list so the library grid picks up the new position
			// when the user navigates back.
			qcRef.current.invalidateQueries({ queryKey: bookKeys.all });
		};
	}, []);

	// ── Flush position on background / teardown ───────────────────────────
	// The unmount cleanup above only runs on a clean React unmount. A web tab
	// close / bfcache (`pagehide`), a tab switch (`visibilitychange` hidden),
	// or a mobile app suspend (Capacitor `pause`) tears the document down, or
	// freezes it before the OS kills it, without ever unmounting. Mirror the
	// flush on those signals so the latest position isn't stranded in memory.
	// In RSVP mode the freshest word lives in the engine; `use-rsvp-engine`
	// flushes its own `pagehide`, which routes through `savePosition` here too.
	useEffect(() => {
		const flush = () => {
			const word = lastWordRef.current;
			if (word !== null && userMovedRef.current) {
				savePositionRef.current(word, { scheduleSync: false });
			} else if (
				word !== null &&
				seededWordRef.current !== null &&
				word !== seededWordRef.current
			) {
				// Same safety net as the unmount path: durably mirror a moved-but-
				// skipped position so a background teardown can't lose it.
				writePendingPosition(id, word, Date.now());
				reportEvent("position_flush_skipped", {
					extra: { origin: "background", word, seed: seededWordRef.current },
				});
			}
		};
		const onVisibility = () => {
			if (document.visibilityState === "hidden") flush();
		};
		window.addEventListener("pagehide", flush);
		document.addEventListener("visibilitychange", onVisibility);
		const pauseListener = CapacitorApp.addListener("pause", flush);
		return () => {
			window.removeEventListener("pagehide", flush);
			document.removeEventListener("visibilitychange", onVisibility);
			void pauseListener
				.then((handle) => handle.remove())
				.catch(() => {
					/* listener never attached; nothing to remove */
				});
		};
	}, []);

	// ─── Render ─────────────────────────────────────────────────────────────

	if (bookPending || (!book && isSyncing)) {
		return (
			<div className="flex h-screen items-center justify-center bg-background">
				<Loader2 className="size-6 animate-spin text-muted-foreground" />
			</div>
		);
	}

	if (!book) {
		return (
			<div className="flex h-screen flex-col bg-background">
				<header className="flex h-12 items-center border-border border-b px-2">
					<button
						type="button"
						onClick={() => history.back()}
						aria-label="Back"
						className="-ml-1 inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
					>
						<ChevronLeft className="size-5" />
					</button>
				</header>
				<div className="flex flex-1 items-center justify-center p-8 text-center text-muted-foreground">
					<p className="m-0">Book not found.</p>
				</div>
			</div>
		);
	}

	const progressPct = totalWordCount > 0 ? Math.min(100, (progressWord / totalWordCount) * 100) : 0;

	const showReadingTime = dbSettings?.showReadingTime ?? DEFAULT_SETTINGS.SHOW_READING_TIME;
	// The dial is an input, not a rate: the engine spends time on punctuation
	// pauses and the accel ramp, so estimating from it runs short. Scale it by
	// what this reader's RSVP sessions actually delivered. Scroll and page have
	// no dial, so they use their own measured speed.
	const estimateWpm =
		readerMode === "rsvp"
			? Math.max(
					1,
					Math.round(
						rsvpSettings.wpm *
							(readingRates.data?.rsvpDeliveredRatio ?? DEFAULT_RSVP_DELIVERED_RATIO),
					),
				)
			: ((paginationStyle === "page" ? readingRates.data?.pageWpm : readingRates.data?.scrollWpm) ??
				AVERAGE_READER_WPM);
	const bookMinutesRemaining =
		showReadingTime && totalWordCount > 0
			? (totalWordCount * (1 - progressPct / 100)) / estimateWpm
			: 0;
	let chapterMinutesRemaining: number | null = null;
	if (showReadingTime && currentChapterIndex >= 0) {
		const ch = chapters[currentChapterIndex];
		const chapterEndWord = chapters[currentChapterIndex + 1]?.startWord ?? totalWordCount;
		const chapterProgress =
			chapterEndWord > ch.startWord
				? Math.max(0, (progressWord - ch.startWord) / (chapterEndWord - ch.startWord))
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

	const overflowSourceUrl =
		book.chapterSourceUrl ??
		book.sourceUrl ??
		(book.catalogId ? externalSourceUrl(book.catalogId) : null);

	return (
		<div className={`reader-theme-${theme} flex h-screen flex-col bg-background text-foreground`}>
			<header className="flex shrink-0 flex-col border-border border-b bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur">
				<div className="flex h-12 items-center gap-0.5 px-1">
					<button
						type="button"
						onClick={() => history.back()}
						aria-label="Back"
						className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
					>
						<ChevronLeft className="size-5" />
					</button>
					{book.seriesId != null && (
						<>
							<Button
								variant="ghost"
								size="icon"
								onClick={() => void chapterAdvance.tryRetreat()}
								disabled={!hasPrev}
								aria-label="Previous chapter"
							>
								<ChevronLeft />
							</Button>
							<Button
								variant="ghost"
								size="icon"
								onClick={() => void chapterAdvance.tryAdvance()}
								disabled={!hasNext}
								aria-label="Next chapter"
							>
								<ChevronRight />
							</Button>
						</>
					)}
					<h1 className="m-0 flex-1 truncate px-1 font-semibold text-base leading-none">
						{book.title}
					</h1>
					<Button
						variant="ghost"
						size="icon"
						onClick={handleRsvpToggle}
						disabled={!content}
						aria-label={
							readerMode === "rsvp" ? "Switch to standard reader" : "Switch to RSVP reader"
						}
						className={readerMode === "rsvp" ? "text-primary" : undefined}
					>
						{readerMode === "rsvp" ? <ZapOff /> : <Zap />}
					</Button>
					<Button
						variant="ghost"
						size="icon"
						onClick={() => setSearchOpen(true)}
						disabled={!content}
						aria-label="Search content"
					>
						<Search />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						onClick={() => setAnnotationsOpen(true)}
						disabled={!content}
						aria-label="Annotations"
					>
						<Bookmark />
					</Button>
					<AppearancePopover
						trigger={
							<Button variant="ghost" size="icon" aria-label="Appearance settings">
								<Type />
							</Button>
						}
					/>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" size="icon" aria-label="More actions">
								<MoreVertical />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-56">
							{overflowSourceUrl && (
								<DropdownMenuItem
									onSelect={() => {
										void Browser.open({ url: overflowSourceUrl });
									}}
								>
									<ExternalLink />
									<span>Open on {series ? providerLabel(series.provider) : "website"}</span>
								</DropdownMenuItem>
							)}
							<DropdownMenuItem
								onSelect={() => {
									history.push(
										book.seriesId != null
											? `/tabs/library/series/${book.seriesId}`
											: `/tabs/library/book/${book.id}`,
									);
								}}
							>
								<Info />
								<span>{book.seriesId != null ? "View series" : "View book"}</span>
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</header>

			<div
				ref={setViewContainerEl}
				className="relative flex-1 overflow-hidden"
				data-testid="reader-view"
			>
				{chapterFetch.kind === "locked" ? (
					<ChapterStateOverlay status="locked" />
				) : chapterFetch.kind === "error" ? (
					<ChapterStateOverlay
						status="error"
						reason={chapterFetch.reason}
						provider={series?.provider}
						onRetry={chapterFetch.retry}
					/>
				) : contentPending || !content || !wordIndex || chapterFetch.kind === "loading" ? (
					<ReaderSkeleton />
				) : readerMode === "rsvp" ? (
					<RsvpView
						ref={rsvpViewRef}
						content={content}
						initialWord={rsvpInitWord}
						settings={rsvpSettings}
						fontSize={readerFontSize}
						onPositionChange={handleRsvpPositionChange}
						onFinished={handleRsvpFinished}
						onWpmChange={handleRsvpWpmChange}
						onLookup={handleRsvpLookup}
						bookWordIndex={wordIndex}
						linkHrefAt={findLinkAt}
						onLinkTap={handleLinkTap}
						isSessionPaused={isSessionPaused}
					/>
				) : paginationStyle === "page" ? (
					<PageView
						ref={scrollViewRef}
						key={`page-${id}`}
						paragraphs={paragraphs}
						paragraphStartWords={paragraphStartWords}
						entriesByParagraph={entriesByParagraph}
						chapterHeadingByParagraph={chapterHeadingByParagraph}
						totalWords={totalWordCount}
						initialWord={lastWordRef.current ?? seedWord ?? 0}
						fontSize={readerFontSize}
						fontFamily={readerFontFamily}
						lineSpacing={readerLineSpacing}
						margin={readerMargin}
						showActiveWordUnderline={readerActiveWordUnderline}
						activeWord={activeWord}
						highlightsByParagraph={sel.highlightsByParagraph}
						glossaryByParagraph={glossaryByParagraph}
						linksByParagraph={linksByParagraph}
						selectionRange={sel.selectionRange}
						isSelecting={isSelecting}
						onWordTap={handlePageWordTap}
						onWordLongPress={sel.handleWordLongPress}
						onWordMouseDragStart={handleWordMouseDragStart}
						onCancelSelection={sel.cancelSelection}
						onPositionSettle={handleScrollPositionSettle}
						onInitialActiveOffset={handleSetActiveWord}
						onTap={handleScrollShowProgressBar}
						footer={advanceFooter}
					/>
				) : (
					<ScrollView
						ref={scrollViewRef}
						key={`scroll-${id}`}
						paragraphs={paragraphs}
						paragraphStartWords={paragraphStartWords}
						entriesByParagraph={entriesByParagraph}
						chapterHeadingByParagraph={chapterHeadingByParagraph}
						findParagraphIndexForWord={findParagraphIndexForWord}
						initialWord={lastWordRef.current ?? seedWord ?? 0}
						fontSize={readerFontSize}
						fontFamily={readerFontFamily}
						lineSpacing={readerLineSpacing}
						margin={readerMargin}
						showActiveWordUnderline={readerActiveWordUnderline}
						activeWord={activeWord}
						highlightsByParagraph={sel.highlightsByParagraph}
						glossaryByParagraph={glossaryByParagraph}
						linksByParagraph={linksByParagraph}
						selectionRange={sel.selectionRange}
						onWordTap={handleWordTap}
						onWordLongPress={sel.handleWordLongPress}
						onWordMouseDragStart={handleWordMouseDragStart}
						onPositionSettle={handleScrollPositionSettle}
						onInitialActiveOffset={handleSetActiveWord}
						onProgressChange={handleSetProgressWord}
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

				{isSessionPaused && <SessionPauseOverlay onResume={() => setIsSessionPaused(false)} />}
			</div>

			{/* Selection toolbar + handles (fixed position, sync'd by hook). */}
			<SelectionOverlay
				isSelecting={sel.isSelecting}
				isSingleWord={
					!!sel.selectionRange && sel.selectionRange.startWord === sel.selectionRange.endWord
				}
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

			{/* ── Merged annotations sheet (Contents / Highlights / Glossary) ── */}
			<AnnotationsSheet
				isOpen={annotationsOpen}
				onClose={() => setAnnotationsOpen(false)}
				theme={theme}
				chapters={chapters}
				onJumpChapter={handleChapterJump}
				seriesId={book.seriesId ?? null}
				highlights={highlightRows}
				onJumpHighlight={handleHighlightJump}
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

			{/* Note input drawer (during selection). */}
			<Drawer
				open={sel.noteInputOpen}
				onOpenChange={(open) => {
					if (!open) sel.handleSelectionNoteDone();
				}}
			>
				<DrawerContent className={`reader-theme-${theme}`}>
					<DrawerHeader className="flex flex-row items-center justify-between gap-2">
						<DrawerTitle className="flex-1">Add Note</DrawerTitle>
						<Button variant="ghost" size="sm" onClick={sel.handleSelectionNoteDone}>
							Done
						</Button>
					</DrawerHeader>
					<div className="px-5 pb-6">
						<textarea
							value={sel.pendingNote}
							onChange={(e) => sel.setPendingNote(e.target.value)}
							placeholder="Add a note to this highlight…"
							rows={4}
							className="min-h-24 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/50"
							// biome-ignore lint/a11y/noAutofocus: intentional focus for note input
							autoFocus
						/>
					</div>
				</DrawerContent>
			</Drawer>
			<SessionDebugBadge getSnapshot={getDebugSnapshot} />
		</div>
	);
};

export default BookReader;
