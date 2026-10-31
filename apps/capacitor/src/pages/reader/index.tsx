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
import type { DiscussionItem, RsvpSettings } from "@lesefluss/core";
import {
	DEFAULT_RSVP_DELIVERED_RATIO,
	DEFAULT_SETTINGS,
	paragraphIndexForWord,
	utf8ByteLength,
	utf8ByteLengthOfCodePoint,
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
import { usePrefersReducedMotion } from "@lesefluss/ui/use-prefers-reduced-motion";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import {
	Bookmark,
	ChevronLeft,
	ChevronRight,
	ExternalLink,
	Headphones,
	Info,
	Loader2,
	MoreVertical,
	Pause,
	Search,
	Type,
	Zap,
	ZapOff,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ActionSheet } from "../../components/action-sheet";
import { VoiceSheet } from "../../components/read-aloud/voice-sheet";
import {
	CommentComposerSheet,
	type CommentSelection,
	DiscussionThreadSheet,
	ShareHighlightSheet,
} from "../../components/social/discussion-sheets";
import { toast } from "../../components/toast";
import { useBLE } from "../../contexts/ble-context";
import { useBookSync } from "../../contexts/book-sync-context";
import { useSyncContext } from "../../contexts/sync-context";
import { useTheme } from "../../contexts/theme-context";
import {
	readerFontFamilyFor,
	readerLayoutFor,
	readingRulerFor,
	textAlignFor,
	textSpacingFor,
	volumeKeysFor,
} from "../../hooks/use-appearance-settings";
import { useAutoSaveSettings } from "../../hooks/use-auto-save-settings";
import { useBookChapters } from "../../hooks/use-book-chapters";
import { useIsForeground } from "../../hooks/use-is-foreground";
import { repairMissingImages } from "../../services/book-import/repair-images";
import { needsImageUpgrade, upgradeBookImages } from "../../services/book-import/upgrade-images";
import { externalSourceUrl } from "../../services/catalog/client";
import { queryHooks } from "../../services/db/hooks";
import { bookKeys, serialKeys, statsKeys } from "../../services/db/hooks/query-keys";
import { queries } from "../../services/db/queries";
import {
	devicePositionWrite,
	nextPositionRevision,
	type PositionRow,
} from "../../services/db/queries/books";
import type { SeriesActivity } from "../../services/db/queries/series";
import type { Book, GlossaryEntry, Highlight } from "../../services/db/schema";
import { requestReminderSync } from "../../services/goal-reminders";
import {
	isOwnRevision,
	onMissedPosition,
	recordOwnRevision,
} from "../../services/position-revisions";
import { providerLabel } from "../../services/serial-scrapers";
import {
	useDiscussion,
	useRefetchDiscussionAsYouRead,
} from "../../services/social/buddy-read-discussion";
import { useIsOnline } from "../../services/social/cache";
import { pushSync, scheduleSyncPush } from "../../services/sync";
import { reportEvent } from "../../services/telemetry";
import { IS_READ_ALOUD_SUPPORTED } from "../../services/tts";
import { languageName, parseVoiceChoices, speechFor, withVoice } from "../../services/tts/voices";
import {
	exposeDevicePosition,
	publishJump,
	publishLinkOpen,
	publishPositionSave,
	publishProgressWord,
	publishSaveFinished,
	publishSaveRequest,
	publishSettle,
	publishSyncPushRequest,
	type SaveSource,
} from "../../test-hooks/reader";
import { AVERAGE_READER_WPM, formatReadingTime } from "../../utils/reading-time";
import { setJustRead } from "../library/just-read-pin";
import { liveToday } from "../library/reading-goal/goal-model";
import AnnotationsSheet from "./annotations-sheet";
import AppearancePopover from "./appearance-popover";
import { BrowseBar } from "./browse-bar";
import type { BrowseSession } from "./browse-controller";
import {
	BuddyReadMarkers,
	type DiscussionTick,
	DiscussionTicks,
	useBuddyReadMarkers,
	useRunningBuddyRead,
} from "./buddy-read-markers";
import { useChapterAutoAdvance } from "./chapter-auto-advance";
import { useChapterFetch } from "./chapter-fetch";
import { buildChapterHeadingMap } from "./chapter-headings";
import { ChapterStateOverlay } from "./chapter-state-overlay";
import DictionaryModal from "./dictionary-modal";
import { clampWord, decideExternalPosition } from "./external-position";
import { colorFromLabel } from "./glossary-avatar";
import GlossaryEntryModal from "./glossary-entry-modal";
import { generateGlossaryId, normalizeGlossaryLabel } from "./glossary-utils";
import { GoalChip } from "./goal-chip";
import { hyphenationLang } from "./hyphenation-lang";
import { useLiveReading } from "./live-board";
import { NextChapterFooter } from "./next-chapter-footer";
import PageView from "./page-view";
import type { ParagraphWordEntry } from "./paragraph";
import {
	clearOwnPendingPosition,
	clearPendingPosition,
	type PendingPosition,
	readPendingPosition,
	recoverPendingWord,
	writePendingPosition,
} from "./pending-position";
import { createPersistedWord } from "./persisted-word";
import { ReadAloudControls } from "./read-aloud-controls";
import { ReaderAnnouncer } from "./reader-announcer";
import { buildFigureMap } from "./reader-figures";
import { ReadingRulerOverlay } from "./reading-ruler-overlay";
import { stripPunct } from "./rsvp-engine";
import RsvpView, { type RsvpViewHandle } from "./rsvp-view";
import ScrollView, { ReaderSkeleton } from "./scroll-view";
import SearchModal from "./search-modal";
import SelectionOverlay from "./selection-overlay";
import { SessionDebugBadge } from "./session-debug-badge";
import { SessionPauseOverlay } from "./session-pause-overlay";
import { firstVisibleWordInView, markSpokenWord } from "./spoken-word";
import { createTwoFingerTapDetector } from "./two-finger-tap";
import { NATIVE_SCROLL_KEYS } from "./use-anchor-hold";
import { useBrowseMode } from "./use-browse-mode";
import {
	findFirstMention,
	findNextMention,
	getMentionContext,
	useGlossaryDecorations,
} from "./use-glossary-decorations";
import { useHighlightSelection } from "./use-highlight-selection";
import { isReaderKey, useKeyboardShortcuts } from "./use-keyboard-shortcuts";
import { useLinkDecorations } from "./use-link-decorations";
import { useLoadedReaderFont } from "./use-loaded-reader-font";
import { useReadAloud } from "./use-read-aloud";
import { useReaderGoal } from "./use-reader-goal";
import { useReadingRuler } from "./use-reading-ruler";
import { type ReadingSessionMode, useReadingSession } from "./use-reading-session";
import { useScrubProgress } from "./use-scrub-progress";
import type { ReaderViewHandle } from "./view-types";
import { wordIndexAt } from "./word-at-point";

// ─── Module-level singletons ─────────────────────────────────────────────────
/** Lets the first paint and scroll of a fresh open settle before a re-parse starts. */
const IMAGE_UPGRADE_DELAY_MS = 3000;

const _encoder = new TextEncoder();

function requestSyncPush() {
	scheduleSyncPush(5000);
	if (import.meta.env.DEV) publishSyncPushRequest();
}

// Sentinel value: no word highlighted (while scrolling)

const EXTERNAL_POSITION_TOAST = "external-position";
const EXTERNAL_POSITION_TOAST_MS = 10_000;

// Resolved at build time, so a production bundle drops the DEV save log; behind
// an `if (DEV)` inside writePosition its body was kept.
const logPositionSave = import.meta.env.DEV ? publishPositionSave : null;

/** `isInDb`: the row holds `row`; false when a pull's merge skipped it for the reader's newer write. */
type ExternalPositionHandler = (row: PositionRow | null, seenRev: number, isInDb: boolean) => void;

const NO_HIGHLIGHT = -1;

const SLEEP_TIMER_MINUTES = [15, 30, 45, 60];
const DETACH_DRAG_PX = 8;
const JUMP_MARK_DELAY_MS = 300;

type ReadAloudHandle = Pick<
	ReturnType<typeof useReadAloud>,
	"detach" | "moveTo" | "pause" | "viewWordRef" | "keepsPositionOnMove" | "ownsPosition"
> & {
	isActive: boolean;
	isPlaying: boolean;
};

// A position write that hasn't settled in this long is treated as wedged/stalled
// and reported as diagnostics (see savePosition).
const POSITION_WRITE_TIMEOUT_MS = 8000;

// Throttle the user-facing "couldn't save" toast so a write that fails on every
// attempt can't spam a toast on every scroll settle.
const SAVE_ERROR_TOAST_THROTTLE_MS = 120_000;
// Touch-sized rows: the shared menu item is ~28px tall, too small to hit reliably on a phone.
const MENU_ITEM_CLASS = "min-h-12 gap-3 px-3 text-base [&_svg:not([class*='size-'])]:size-5";
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
	const { isSyncing, isLoggedIn, syncNow } = useSyncContext();
	const qc = useQueryClient();
	const history = useRouter().history;

	// ── Data queries ──────────────────────────────────────────────────────
	const { data: book, isPending: bookPending } = queryHooks.useBook(id);
	const readingRates = queryHooks.useStatsReadingRates();
	const { data: contentRow, isPending: contentPending } = queryHooks.useBookContent(id);
	const { data: wordIndex } = queryHooks.useBookWordIndex(id);
	const { data: bookImages, isPending: imagesPending } = queryHooks.useBookImages(id);
	const imageAnchors = useMemo(
		() => queries.parseImageAnchors(contentRow?.imageAnchors ?? null),
		[contentRow?.imageAnchors],
	);
	// Rows are written after the import commit; an app killed mid-write leaves
	// anchors without rows, which the original file on disk can fill in.
	const bookFilePath = book?.filePath ?? null;
	useEffect(() => {
		if (!bookImages) return;
		void repairMissingImages(
			{ id, filePath: bookFilePath },
			imageAnchors,
			bookImages.map((img) => img.key),
		);
	}, [id, bookFilePath, bookImages, imageAnchors]);

	const content = contentRow?.content ?? null;

	// A book imported before images were captured gets them on its first open.
	const bookFileFormat = book?.fileFormat ?? null;
	const imageAnchorsColumn = contentRow?.imageAnchors ?? null;
	useEffect(() => {
		if (!content || !wordIndex || !bookFileFormat) return;
		if (
			!needsImageUpgrade({ fileFormat: bookFileFormat, filePath: bookFilePath }, imageAnchorsColumn)
		) {
			return;
		}
		const timer = setTimeout(() => {
			void upgradeBookImages({ id, filePath: bookFilePath }, content, wordIndex);
		}, IMAGE_UPGRADE_DELAY_MS);
		return () => clearTimeout(timer);
	}, [id, content, wordIndex, bookFileFormat, bookFilePath, imageAnchorsColumn]);
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

	const { theme, isEinkMode } = useTheme();
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
	// Original casing, as the word appears in the book. The dictionary API folds
	// it into a lookup key itself, and casing is the only thing separating some
	// German homographs ("Bäume" the trees from "bäume" the verb).
	const [selectedWord, setSelectedWord] = useState<string | null>(null);

	const openDictionaryModal = useCallback((word: string) => {
		setSelectedWord(word);
	}, []);

	const closeDictionaryModal = useCallback(() => {
		setSelectedWord(null);
	}, []);

	// ── Reader mode ───────────────────────────────────────────────────────
	// Two top-level modes: the user toggles between them with the flash button.
	// Within "standard", the rendered view is scroll or page depending on the
	// paginationStyle setting (decided at render time, not stored here).
	const [readerMode, setReaderMode] = useState<"standard" | "rsvp">("standard");
	const [isRsvpPlaying, setIsRsvpPlaying] = useState(false);
	const readerModeRef = useRef(readerMode);
	readerModeRef.current = readerMode;

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
	const shownProgressRef = useRef(0);
	useEffect(() => {
		progressWordRef.current = progressWord;
		shownProgressRef.current = progressWord;
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
	// The position the reader last came to rest on (seed, settle, save). Scroll
	// ticks write coarse paragraph-start words into lastWordRef mid-gesture; a
	// scroll end that didn't really move restores this instead of keeping them.
	const settledWordRef = useRef<number | null>(null);
	const onPositionSavedRef = useRef<((word: number) => void) | null>(null);
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
	const stampJump = useCallback(() => {
		lastJumpAtRef.current = Date.now();
		if (import.meta.env.DEV) publishJump(lastJumpAtRef.current);
	}, []);
	const JUMP_SETTLE_GUARD_MS = 1500;
	const persistedWordRef = useRef(createPersistedWord());
	// The revision this reader's writes build on: the newest of the row it has seen.
	// A write lands only on it, so a position written meanwhile is never replaced.
	const baseRevRef = useRef(0);
	const lastLandedRevRef = useRef(0);
	// Counts the reader's moves, so a landed write knows whether one came after it.
	const localMoveCountRef = useRef(0);
	// The newest landed write was RSVP or the voice, and nothing moved since.
	const isPlaybackSaveNewestRef = useRef(false);
	// The newest row from elsewhere this reader has already decided on.
	const decidedRevRef = useRef(0);
	// Moved since the reader's last landed write or adopt: against a newer row from
	// another device, the reader's own position is then the newer one.
	const hasLocalMoveRef = useRef(false);
	// Where Undo goes back to: the position before the first of adopts in a row.
	const undoAdoptRef = useRef<{ word: number; timer: number } | null>(null);
	const clearAdoptUndo = useCallback(() => {
		const undo = undoAdoptRef.current;
		if (!undo) return;
		clearTimeout(undo.timer);
		undoAdoptRef.current = null;
		toast.dismiss(EXTERNAL_POSITION_TOAST);
	}, []);
	const markPositionMove = useCallback(() => {
		userMovedRef.current = true;
		hasLocalMoveRef.current = true;
		localMoveCountRef.current++;
		isPlaybackSaveNewestRef.current = false;
		clearAdoptUndo();
	}, [clearAdoptUndo]);
	// Assigned once browse mode is set up (further down).
	const isBrowsingViewRef = useRef<() => boolean>(() => false);
	/** The reader moved. While browsing only the view moves: the position stays the anchor. */
	const markLocalMove = useCallback(() => {
		if (isBrowsingViewRef.current()) userMovedRef.current = true;
		else markPositionMove();
	}, [markPositionMove]);
	/** RSVP or the voice played on: the reader's spot, but not a move against another device. */
	const markPlaybackMove = useCallback(() => {
		userMovedRef.current = true;
	}, []);
	// Assigned once the reader can move its view (further down).
	const onExternalPositionRef = useRef<ExternalPositionHandler>(() => {});
	// Assigned once read-aloud is set up (further down); its hook calls back into it.
	const backToVoiceRef = useRef<() => void>(() => {});
	// Assigned once `useReadAloud` runs further down. While active, the voice owns the position.
	const readAloudRef = useRef<ReadAloudHandle | null>(null);
	const isReadAloudActiveNow = useCallback(() => readAloudRef.current?.isActive ?? false, []);
	// Assigned once `useReadingSession` runs further down.
	const browseSessionRef = useRef<BrowseSession | null>(null);
	const { anchor: browseAnchor, controller: browse } = useBrowseMode({
		getLastWord: () => lastWordRef.current,
		getPersistedWord: () => persistedWordRef.current.get(),
		isRsvp: () => readerModeRef.current === "rsvp",
		writePosition: (word) => {
			markPositionMove();
			void writePosition(word, "browse");
		},
		showUnsavedMove: (word) => showUnsavedMove(word),
		getSession: () => browseSessionRef.current,
		notifyAutoCommit: (word, undo) => {
			toast.info(`Reading position moved to ${Math.round(percentOfBook(word))}%`, {
				duration: 10_000,
				action: { label: "Undo", onClick: undo },
			});
		},
	});
	isBrowsingViewRef.current = () => browse.isBrowsing && readerModeRef.current !== "rsvp";

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
		settledWordRef.current = null;
		seededWordRef.current = null;
		userMovedRef.current = false;
		hasLocalMoveRef.current = false;
		isPlaybackSaveNewestRef.current = false;
		baseRevRef.current = 0;
		lastLandedRevRef.current = 0;
		decidedRevRef.current = 0;
		clearAdoptUndo();
		persistedWordRef.current.set(null);
		browse.reset();
	}, [id, browse, clearAdoptUndo]);

	const seedWord = book?.wordPosition ?? null;
	const seedLastRead = book?.lastRead ?? 0;
	const seedRev = book?.updatedAt ?? 0;

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
			hasLocalMoveRef.current = true;
		}
		clearPendingPosition(id);
		baseRevRef.current = seedRev;
		decidedRevRef.current = seedRev;

		setActiveWord(resolved);
		setProgressWord(resolved);
		setRsvpInitWord(resolved);
		lastWordRef.current = resolved;
		settledWordRef.current = resolved;
		seededWordRef.current = resolved;
		persistedWordRef.current.set(seedWord);
	}, [seedWord, seedLastRead, id, seedRev]);

	// Live-seek when the device pushes a new position for this book over BLE.
	// book-sync-context applies the conflict-resolution tolerance gate first,
	// so we only see notifies the user should visibly follow. Gated on
	// isBleConnected so a user who never pairs pays nothing. We mirror what
	// jumpToWord does (state + scroll) but skip savePosition/pushPosition:
	// the DB row was already updated by applyDevicePosition, and pushing back
	// to the device would echo the value it just sent us.
	const followDevicePosition = useCallback(
		(newWordPosition: number, updatedAt: number) => {
			const totalWords = wordIndex?.wordCount ?? book?.wordCount ?? 0;
			// Without a known upper bound a malformed notify would persist a
			// huge word index via the unmount-flush.
			if (totalWords === 0) return;
			if (newWordPosition < 0 || newWordPosition >= totalWords) return;
			// The device wrote the row; the reader's next write builds on that.
			baseRevRef.current = Math.max(baseRevRef.current, updatedAt);
			decidedRevRef.current = Math.max(decidedRevRef.current, updatedAt);
			persistedWordRef.current.set(newWordPosition);
			if (browse.onDevicePosition(newWordPosition)) return;
			setActiveWord(newWordPosition);
			setProgressWord(newWordPosition);
			setRsvpInitWord(newWordPosition);
			lastWordRef.current = newWordPosition;
			settledWordRef.current = newWordPosition;
			// Stops the unmount-flush from overwriting the device's fresh
			// position with a stale seed during a route re-mount.
			userMovedRef.current = true;
			scrollViewRef.current?.jumpTo(newWordPosition, {
				highlight: true,
				fine: true,
				smooth: true,
			});
		},
		[wordIndex?.wordCount, book?.wordCount, browse],
	);
	useEffect(() => {
		if (!isBleConnected) return;
		return onDevicePositionUpdate((bookId, word, updatedAt) => {
			if (bookId === id) followDevicePosition(word, updatedAt);
		});
	}, [id, isBleConnected, onDevicePositionUpdate, followDevicePosition]);
	useEffect(() => {
		if (!import.meta.env.DEV) return;
		// What book-sync-context does for a device ahead: write the row, then notify.
		return exposeDevicePosition(async (word) => {
			const write = devicePositionWrite(wordPos(word), Date.now(), baseRevRef.current);
			await queries.updateBook(id, write);
			followDevicePosition(word, write.updatedAt);
		});
	}, [id, followDevicePosition]);

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
		return paragraphOffsets.map((b) => wordIndex.firstShownWord(b));
	}, [paragraphOffsets, wordIndex]);

	// Per-paragraph slice of canonical WordIndex entries with paragraph-local
	// char offsets. The Paragraph component renders one span per entry with
	// `data-word=entry.wordIndex`, so DOM word indices are always the canonical
	// ones from the WordIndex.
	const entriesByParagraph = useMemo<ParagraphWordEntry[][]>(() => {
		if (!wordIndex || paragraphs.length === 0) return paragraphs.map(() => []);
		// Byte offsets only: listEntries() would build a word string per word of the
		// whole book, hundreds of thousands of objects for a long novel, on every open.
		const wordCount = wordIndex.wordCount;
		const byteAt = (k: number) => wordIndex.byteOf(wordPos(k));
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

			while (cursor < wordCount && byteAt(cursor) < paraByteStart) cursor++;
			let end = cursor;
			while (end < wordCount && byteAt(end) < paraByteEnd) end++;

			const items: ParagraphWordEntry[] = [];
			let i = 0;
			let b = paraByteStart;
			for (let k = cursor; k < end; k++) {
				const wordByte = byteAt(k);
				while (b < wordByte && i < paraText.length) {
					const cp = paraText.codePointAt(i) ?? 0;
					b += utf8ByteLengthOfCodePoint(cp);
					i += cp >= 0x10000 ? 2 : 1;
				}
				const charStart = i;
				const nextByte = k + 1 < end ? byteAt(k + 1) : paraByteEnd;
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
	const { chapters } = useBookChapters(id);

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
	const percentOfBook = (word: number) =>
		totalWordCount > 0 ? Math.min(100, (word / totalWordCount) * 100) : 0;

	// Body images (EPUB imports) keyed by the paragraph they precede. Empty for
	// every book imported before images were captured, so nothing else changes.
	const figureMap = useMemo(
		() =>
			wordIndex
				? buildFigureMap(
						id,
						imageAnchors,
						bookImages ?? [],
						paragraphOffsets,
						totalWordCount,
						(word) => wordIndex.byteOfClamped(word),
					)
				: buildFigureMap(id, [], [], paragraphOffsets, 0, () => 0),
		[id, imageAnchors, bookImages, paragraphOffsets, totalWordCount, wordIndex],
	);

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
	const readerFont = useLoadedReaderFont(
		dbSettings ? readerFontFamilyFor(dbSettings.readerFontFamily) : null,
		dbSettings?.readerBold ?? DEFAULT_SETTINGS.READER_BOLD,
	);
	const readerLineSpacing = dbSettings?.readerLineSpacing ?? DEFAULT_SETTINGS.READER_LINE_SPACING;
	const readerMargin = dbSettings?.readerMargin ?? DEFAULT_SETTINGS.READER_MARGIN;
	const readerLetterSpacing = dbSettings?.readerLetterSpacing;
	const readerWordSpacing = dbSettings?.readerWordSpacing;
	const readerParagraphSpacing = dbSettings?.readerParagraphSpacing;
	const textSpacing = useMemo(
		() => textSpacingFor({ readerLetterSpacing, readerWordSpacing, readerParagraphSpacing }),
		[readerLetterSpacing, readerWordSpacing, readerParagraphSpacing],
	);
	const textAlign = textAlignFor(dbSettings?.readerTextAlign);
	const readerActiveWordUnderline =
		dbSettings?.readerActiveWordUnderline ?? DEFAULT_SETTINGS.READER_ACTIVE_WORD_UNDERLINE;
	const readerGlossaryUnderline =
		dbSettings?.readerGlossaryUnderline ?? DEFAULT_SETTINGS.READER_GLOSSARY_UNDERLINE;
	// Under OS reduce-motion turns are instant, not just unanimated: CSS alone would
	// stop the slide but keep its wait before the settle.
	const { paginationStyle, pageTurnAnimation } = readerLayoutFor(
		dbSettings,
		isEinkMode,
		usePrefersReducedMotion(),
	);
	const readingRuler = readingRulerFor(dbSettings);
	const isRulerShown = readingRuler.isOn && readerMode !== "rsvp";
	// A visual aid only: it never scrolls, turns a page or touches the position refs.
	const {
		ruler,
		onMotion: onRulerMotion,
		onColumns: onRulerColumns,
	} = useReadingRuler({
		view: viewContainerEl,
		isOn: isRulerShown,
		lines: readingRuler.lines,
		isPaged: paginationStyle === "page" && readerMode !== "rsvp",
		layoutKey: dbSettings,
	});

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
	const writePosition = useCallback(
		async (
			word: number,
			source: SaveSource,
			{ scheduleSync = true }: { scheduleSync?: boolean } = {},
		) => {
			settledWordRef.current = word;
			// The row already holds this word. Rewriting it would stamp a new updatedAt,
			// the position's last-write-wins revision, making a stale word "newest" on
			// every app switch; a lastRead-only write would reorder the library for a
			// book nobody moved in. The push still goes out: an earlier save of this word
			// may have skipped it (RSVP's pause before its exit), and a push stamps nothing.
			if (!persistedWordRef.current.needsWrite(word)) {
				if (scheduleSync) requestSyncPush();
				return;
			}
			const writeToken = persistedWordRef.current.begin(word);
			const now = Date.now();
			const wordPosition = wordPos(word);

			// Durable fallback: mirror the position to localStorage synchronously
			// BEFORE the async DB write, stamped with the same `now` that becomes
			// the row's lastRead. If a teardown abandons the write below, this
			// survives and the next mount recovers it; if the write commits, we
			// clear it just after so a stale entry never outlives a real save.
			writePendingPosition(id, word, now);
			if (import.meta.env.DEV) publishSaveRequest();

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
			const baseRev = baseRevRef.current;
			const stamp = nextPositionRevision(now, baseRev);
			// A write issued after this one builds on it.
			baseRevRef.current = stamp;
			recordOwnRevision(id, stamp);
			const movesAtWrite = localMoveCountRef.current;
			try {
				let result: Awaited<ReturnType<typeof queries.writeReaderPosition>>;
				try {
					result = await queries.writeReaderPosition(id, { wordPosition, lastRead: now, baseRev });
				} catch {
					// The adapter already reports the underlying db_write_error. Tell the
					// user it didn't save so they know it's not intended, keep the
					// synchronous fallback (do NOT clear it) so the next mount can recover,
					// and skip the post-commit steps below.
					notifyLocalSaveFailure();
					persistedWordRef.current.fail(writeToken);
					return;
				} finally {
					settled = true;
					clearTimeout(watchdog);
				}
				// The row is no longer this write's to recover over, either way.
				clearOwnPendingPosition(id, { word, at: now });
				if (!result.isWritten) {
					// A newer position was written meanwhile (a sync pull, a device).
					persistedWordRef.current.fail(writeToken);
					baseRevRef.current = Math.max(result.row?.updatedAt ?? 0, lastLandedRevRef.current);
					void qc.invalidateQueries({ queryKey: bookKeys.all });
					onExternalPositionRef.current(result.row, baseRev, true);
					return;
				}
				lastLandedRevRef.current = Math.max(lastLandedRevRef.current, stamp);
				if (localMoveCountRef.current === movesAtWrite) {
					hasLocalMoveRef.current = false;
					isPlaybackSaveNewestRef.current = source === "rsvp" || source === "read-aloud";
				}
				onPositionSavedRef.current?.(word);
				logPositionSave?.(id, word, source);
				await pushPosition(id, word);
				if (scheduleSync) requestSyncPush();
			} finally {
				if (import.meta.env.DEV) publishSaveFinished();
			}
		},
		[id, pushPosition, book?.seriesId, qc],
	);

	const savePosition = useCallback(
		async (word: number, source: SaveSource, opts?: { scheduleSync?: boolean }) => {
			// RSVP never browses: its saves always land, whatever state the anchor is in.
			if (browse.isBrowsing && readerModeRef.current !== "rsvp") {
				// Still the resting word: the settle clamp compares against it.
				settledWordRef.current = word;
				return;
			}
			await writePosition(word, source, opts);
		},
		[writePosition, browse],
	);

	const isMountedRef = useRef(true);
	useEffect(
		() => () => {
			isMountedRef.current = false;
			clearAdoptUndo();
			toast.dismiss(EXTERNAL_POSITION_TOAST);
		},
		[clearAdoptUndo],
	);
	const isRsvpPlayingRef = useRef(isRsvpPlaying);
	isRsvpPlayingRef.current = isRsvpPlaying;
	/** Moves the view to a word the DB already holds, without saving. */
	const showUnsavedMove = useCallback(
		(word: number) => {
			setActiveWord(word);
			setProgressWord(word);
			lastWordRef.current = word;
			settledWordRef.current = word;
			// The jump's settle doesn't reach read-aloud: playing, the voice would save the
			// spot left behind; paused, play would read from it.
			const readAloud = readAloudRef.current;
			if (readAloud?.isPlaying) readAloud.moveTo(word);
			else if (readAloud?.isActive) readAloud.detach(word);
			stampJump();
			scrollViewRef.current?.jumpTo(word, { highlight: true });
		},
		[stampJump],
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
		void savePosition(recovered, "recovered");
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
			const readAloud = readAloudRef.current;
			// Playing, the voice goes there; paused, the view moves and the reader keeps the spot.
			if (readAloud?.isActive && readAloud.moveTo(word)) {
				setActiveWord(word);
				setProgressWord(word);
				stampJump();
				scrollViewRef.current?.jumpTo(word, { highlight });
				rsvpViewRef.current?.showWord(word);
				// A far target is not in the DOM until the jump lands.
				window.setTimeout(() => markSpokenWord(word), JUMP_MARK_DELAY_MS);
				return;
			}
			// A jump while the voice is paused is saved as the reader's spot rather than browsed.
			if (!readAloud?.isActive) browse.enterForJump(word);
			setActiveWord(word);
			setProgressWord(word);
			lastWordRef.current = word;
			markLocalMove();
			stampJump();
			savePosition(word, "jump");
			scrollViewRef.current?.jumpTo(word, { highlight });
		},
		[savePosition, browse, stampJump, markLocalMove],
	);

	/** Goes to `word` on the reader's own behalf (Undo, Go there): a move like any other. */
	const goToWordAsReader = useCallback(
		(word: number) => {
			if (!isMountedRef.current) return;
			// Playing, the voice goes there; paused, the reader takes the spot from it.
			if (readAloudRef.current?.isActive) {
				jumpToWord(word);
				return;
			}
			markPositionMove();
			if (!browse.onDevicePosition(word)) {
				if (readerModeRef.current === "rsvp") {
					lastWordRef.current = word;
					rsvpViewRef.current?.showWord(word);
				} else showUnsavedMove(word);
			}
			void writePosition(word, "jump");
		},
		[jumpToWord, markPositionMove, browse, showUnsavedMove, writePosition],
	);

	const handleExternalPosition = useCallback<ExternalPositionHandler>(
		(row, seenRev, isInDb) => {
			const wordCount = wordIndex?.wordCount ?? book?.wordCount ?? 0;
			const theirs = row && { ...row, wordPosition: clampWord(row.wordPosition, wordCount) };
			const ours = browse.anchor ?? lastWordRef.current;
			const decision = decideExternalPosition(theirs, {
				seenRev: Math.max(seenRev, decidedRevRef.current),
				isOwnRevision: (rev) => isOwnRevision(id, rev),
				ourWord: ours,
				hasLocalMove: hasLocalMoveRef.current,
				isRsvpPlaying: isRsvpPlayingRef.current,
				isReadAloudPlaying: readAloudRef.current?.isPlaying ?? false,
				isSkippedForPlaybackSave: !isInDb && isPlaybackSaveNewestRef.current,
			});
			if (!theirs || decision === "ignore") return;
			decidedRevRef.current = Math.max(decidedRevRef.current, theirs.updatedAt);
			baseRevRef.current = Math.max(baseRevRef.current, theirs.updatedAt);
			const word = theirs.wordPosition;
			if (isInDb && decision !== "advance") persistedWordRef.current.set(word);
			if (decision === "advance") {
				if (word === ours) {
					persistedWordRef.current.set(word);
					seededWordRef.current = word;
				}
				return;
			}
			if (decision === "keep") {
				if (ours !== null && persistedWordRef.current.needsWrite(ours)) {
					void writePosition(ours, "kept-local");
				}
				if (!isMountedRef.current) return;
				toast.info("Newer position from another device", {
					id: EXTERNAL_POSITION_TOAST,
					duration: EXTERNAL_POSITION_TOAST_MS,
					action: { label: "Go there", onClick: () => goToWordAsReader(word) },
				});
				return;
			}
			hasLocalMoveRef.current = false;
			isPlaybackSaveNewestRef.current = false;
			seededWordRef.current = word;
			if (!isInDb) void writePosition(word, "adopted");
			if (!isMountedRef.current) return;
			const undoWord = undoAdoptRef.current?.word ?? ours;
			if (undoAdoptRef.current) clearTimeout(undoAdoptRef.current.timer);
			undoAdoptRef.current =
				undoWord === null
					? null
					: {
							word: undoWord,
							timer: window.setTimeout(() => {
								undoAdoptRef.current = null;
							}, EXTERNAL_POSITION_TOAST_MS),
						};
			// Paused, the voice reads on from here when played again.
			if (readAloudRef.current?.isActive) readAloudRef.current.keepsPositionOnMove(word);
			if (!browse.onDevicePosition(word)) {
				if (readerModeRef.current === "rsvp") {
					lastWordRef.current = word;
					settledWordRef.current = word;
					rsvpViewRef.current?.showWord(word);
				} else showUnsavedMove(word);
			}
			toast.info("Moved to where you left off on another device", {
				id: EXTERNAL_POSITION_TOAST,
				duration: EXTERNAL_POSITION_TOAST_MS,
				action:
					undoWord === null
						? undefined
						: { label: "Undo", onClick: () => goToWordAsReader(undoWord) },
			});
		},
		[
			id,
			wordIndex?.wordCount,
			book?.wordCount,
			browse,
			writePosition,
			showUnsavedMove,
			goToWordAsReader,
		],
	);
	onExternalPositionRef.current = handleExternalPosition;

	// A sync pull (or a device) writes the row behind the open reader; the book
	// query refetches it.
	useEffect(() => {
		if (!book || !didSeedOffsetsRef.current) return;
		handleExternalPosition(
			{ wordPosition: book.wordPosition, updatedAt: book.updatedAt },
			baseRevRef.current,
			true,
		);
	}, [book, handleExternalPosition]);

	// A pull found the reader's own write newer than its position and skipped it.
	useEffect(
		() =>
			onMissedPosition((bookId, row) => {
				if (bookId === id) handleExternalPosition(row, 0, false);
			}),
		[id, handleExternalPosition],
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
		isReadingAloud: isReadAloudActiveNow,
	});

	// ── ScrollView callbacks ──────────────────────────────────────────────
	const { isSelecting, syncHandlesRef } = sel;
	const { isScrubbingRef } = scrub;

	// Forward-declared activity callback. `useReadingSession` (called later in
	// the component) assigns into this ref so handlers above the hook can call
	// it without circular reference. Stays null until the hook mounts; safely
	// noop during the first render.
	const markActivityRef = useRef<(() => void) | null>(null);

	// Within JUMP_SETTLE_GUARD_MS of a jump, a scroll-mode settle is the virtual
	// list reconciling it; its viewport-top word sits before the jumped heading.
	// Page mode has no such reconcile and a jump reports no settle there, so every
	// settle is a real page turn.
	const isReconcilingJump = useCallback(
		() => paginationStyle === "scroll" && Date.now() - lastJumpAtRef.current < JUMP_SETTLE_GUARD_MS,
		[paginationStyle],
	);

	const handleScrollPositionSettle = useCallback(
		(word: number, isAtEnd = false, hasMoved = true) => {
			if (import.meta.env.DEV) publishSettle(word);
			const readAloud = readAloudRef.current;
			if (readAloud?.isActive) {
				// In scroll mode, a settle while following that no reader input caused is the
				// view's own scroll (the voice's follow, a jump reconciling, a re-measure). A
				// page turn detaches only through its settle.
				const isViewScroll =
					isReconcilingJump() ||
					(paginationStyle === "scroll" &&
						isFollowingVoiceRef.current &&
						!scrollViewRef.current?.isReaderScrolling?.());
				const isReaderMove = hasMoved && !isViewScroll;
				if (isReaderMove && readAloud.keepsPositionOnMove(word)) return;
				if (!isReaderMove && readAloud.ownsPosition()) {
					// The scroll hid the spoken word's mark; it is still the position.
					const spoken = lastWordRef.current;
					if (spoken !== null) {
						setActiveWord(spoken);
						setProgressWord(spoken);
					}
					return;
				}
			}
			// Stay on the settled word when the view didn't really move (a layout
			// clamp), or at the very bottom, where a later word is still on screen
			// but can never reach the top.
			const settledWord = settledWordRef.current;
			if (settledWord !== null && (!hasMoved || (isAtEnd && settledWord > word))) {
				lastWordRef.current = settledWord;
				setActiveWord(settledWord);
				setProgressWord(settledWord);
				return;
			}
			// Always restore the underline. A word already saved skips the save so
			// opening a book doesn't bump lastRead. Not lastWordRef: scroll ticks set
			// it to paragraph starts, so a settle on one would never be saved.
			setActiveWord(word);
			setProgressWord(word);
			const isJumpSettle = isReconcilingJump();
			// Before the already-saved return: skipping those settles would break the
			// detector chain.
			// With read-aloud on, a paused session's moves never enter browse; but in a
			// browse the pause opened (looking away while it played), reading on by eye
			// commits the spot as it would without read-aloud. Playing feeds nothing.
			const feedsBrowse = !readAloud?.isActive || (!readAloud.isPlaying && browse.isBrowsing);
			const hasResumedReading =
				!isJumpSettle &&
				feedsBrowse &&
				settledWord !== null &&
				browse.recordSettle(settledWord, word);
			if (isJumpSettle) {
				// The jump target may exist only in lastWordRef (a browse jump saves nothing).
				if (lastWordRef.current === word) settledWordRef.current = word;
				return;
			}
			if (persistedWordRef.current.get() === word) {
				lastWordRef.current = word;
				settledWordRef.current = word;
				if (hasResumedReading) browse.autoCommit();
				return;
			}
			lastWordRef.current = word;
			markLocalMove();
			savePosition(word, "settle");
			if (hasResumedReading) browse.autoCommit();
			markActivityRef.current?.();
			// End-of-book chapter advance (serials only). `wordCount > 32` keeps a
			// freshly fetched, momentarily empty chapter from advancing on mount.
			const totalWords = book?.wordCount ?? 0;
			// Reaching the end while only looking around isn't finishing the chapter.
			if (!browse.isBrowsing && totalWords > 32 && word >= totalWords - 1) {
				void chapterAdvance.tryAdvance();
			}
		},
		[
			savePosition,
			browse,
			chapterAdvance,
			book?.wordCount,
			isReconcilingJump,
			markLocalMove,
			paginationStyle,
		],
	);

	// While read-aloud runs detached, lastWordRef is the spoken word, not the one in view.
	const getScrollAnchorWord = useCallback(() => {
		const readAloud = readAloudRef.current;
		if (readAloud?.isActive && !isFollowingVoiceRef.current) return readAloud.viewWordRef.current;
		return lastWordRef.current;
	}, []);

	const handleScrollHighlightClear = useCallback(() => {
		setActiveWord((prev) => (prev === NO_HIGHLIGHT ? prev : NO_HIGHLIGHT));
	}, []);

	const handleHideProgressBar = useCallback(() => setProgressBarVisible(false), []);
	// The scroll container's click listener is native, so it reads the selection through refs.
	const tapSelectionRef = useRef({ isSelecting: sel.isSelecting, cancel: sel.cancelSelection });
	tapSelectionRef.current = { isSelecting: sel.isSelecting, cancel: sel.cancelSelection };
	const handleScrollShowProgressBar = useCallback(() => {
		setProgressBarVisible(true);
		// The reading position, not the last scroll tick: a tick is a paragraph
		// start, and a settle to the value already shown never refreshes the
		// tick ref, so in long paragraphs it can sit far from where you are.
		setProgressWord(lastWordRef.current ?? progressWordRef.current);
		markActivityRef.current?.();
	}, []);
	// A tap on empty reader space while selecting (a margin, between paragraphs)
	// dismisses the selection instead of opening the progress bar. Word taps go to
	// handleWordTap (word-gestures' document listener, which runs before this one)
	// and deal with a selection there. The click ending a drag or long-press
	// selection is swallowed before it gets here.
	const handleScrollTap = useCallback(
		(e?: MouseEvent) => {
			const onWord = e?.target instanceof Element && e.target.closest("span[data-word]");
			if (tapSelectionRef.current.isSelecting && !onWord) {
				tapSelectionRef.current.cancel();
				return;
			}
			handleScrollShowProgressBar();
		},
		[handleScrollShowProgressBar],
	);
	// Page mode has no scrolling, so the scroll-driven hide path never fires
	// there and the centre tap zone is the user's only way to dismiss the bar.
	const handleToggleProgressBar = useCallback(() => {
		if (progressBarVisibleRef.current) setProgressBarVisible(false);
		else handleScrollShowProgressBar();
	}, [handleScrollShowProgressBar]);
	const handleSetActiveWord = useCallback((word: number) => setActiveWord(word), []);
	const handleSetProgressWord = useCallback(
		(word: number, isAtEnd = false) => {
			if (readAloudRef.current?.ownsPosition()) return;
			progressWordRef.current = word;
			// Tracked per tick so a flush or pagination toggle mid-scroll uses the
			// current position, except: during a jump's scroll animation, and when
			// the tick (a paragraph's first word) is coarser than lastWord: the same
			// paragraph, or at the very bottom where a later word is still on screen.
			const lastWord = lastWordRef.current;
			const isCoarserThanLast =
				lastWord !== null &&
				(findParagraphIndexForWord(lastWord) === findParagraphIndexForWord(word) ||
					(isAtEnd && lastWord >= word));
			if (!isCoarserThanLast && Date.now() - lastJumpAtRef.current >= JUMP_SETTLE_GUARD_MS) {
				lastWordRef.current = word;
				markLocalMove();
			}
			// A coarser tick would pull the bar back to the paragraph start. Per-tick
			// renders dominated hold-scroll cost, so the resting line only follows
			// in half-percent steps; the settle writes the exact value anyway.
			const step = Math.abs(word - shownProgressRef.current) >= totalWordCount * 0.005;
			if (!isCoarserThanLast && (progressBarVisibleRef.current || step)) {
				setProgressWord(word);
			}
			markActivityRef.current?.();
		},
		[findParagraphIndexForWord, totalWordCount, markLocalMove],
	);

	const syncSelectionHandles = useCallback(() => {
		syncHandlesRef.current();
	}, [syncHandlesRef]);

	// ── Word tap handler ───────────────────────────────────────────────────
	// During selection mode: tapping anywhere cancels the selection (user
	// adjusts range via handles, not word taps).
	// Normal mode - first tap: set position (highlight it).
	// Normal mode - second tap on highlighted word: select the highlight for editing
	//   (if highlighted) or open the dictionary (if not highlighted).
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
				const word = stripPunct(wordText);
				if (word) openDictionaryModal(word);
				return;
			}
			if (readAloudRef.current?.isActive && readAloudRef.current.moveTo(wIdx)) {
				// The voice takes a moment to get there; the mark moves now. A second tap on the
				// same word opens the dictionary, as when not listening.
				markSpokenWord(wIdx);
				setActiveWord(wIdx);
				return;
			}
			setActiveWord(wIdx);
			setProgressWord(wIdx);
			setProgressBarVisible(true);
			lastWordRef.current = wIdx;
			markLocalMove();
			savePosition(wIdx, "word-tap");
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
			markLocalMove,
		],
	);

	// Page mode uses tap zones for navigation; word taps are intentionally inert
	// (long-press is the entry point for selection / highlight / look-up). The
	// only thing we still honour is "tap dismisses an active selection".
	const handlePageWordTap = useCallback(() => {
		if (isSelecting) cancelSelection();
	}, [isSelecting, cancelSelection]);

	const discussionRead = useRunningBuddyRead(book?.originKey ?? null, isLoggedIn);
	const isForeground = useIsForeground();
	const isOnline = useIsOnline();
	const discussion = useDiscussion(discussionRead?.id ?? null, {
		poll: isForeground && isOnline,
	});
	const refetchDiscussionAsYouRead = useRefetchDiscussionAsYouRead(
		discussionRead?.id ?? null,
		discussion,
		isOnline,
		pushSync,
	);
	const [threadIds, setThreadIds] = useState<string[] | null>(null);
	const [commentSelection, setCommentSelection] = useState<CommentSelection | null>(null);
	const [sharingHighlight, setSharingHighlight] = useState<Highlight | null>(null);
	const discussionItems = discussion.data?.items;
	// Derived from the live query so a reply or reaction made in the open sheet shows up.
	const threadItems = useMemo(
		() => (threadIds ? (discussionItems ?? []).filter((i) => threadIds.includes(i.id)) : null),
		[threadIds, discussionItems],
	);
	const discussionByParagraph = useMemo(() => {
		if (!discussionItems?.length) return undefined;
		const groups = new Map<number, DiscussionItem[]>();
		for (const item of discussionItems) {
			const idx = findParagraphIndexForWord(item.startWord);
			groups.set(idx, [...(groups.get(idx) ?? []), item]);
		}
		return new Map(
			[...groups].map(([idx, items]) => [
				idx,
				{ count: items.length, onTap: () => setThreadIds(items.map((i) => i.id)) },
			]),
		);
	}, [discussionItems, findParagraphIndexForWord]);

	// Browsing moves the view, not the reading.
	const { goalPlan, goalToday, goalDivider, furthestReadToday, reportFurthestRead } = useReaderGoal(
		book,
		browseAnchor ?? progressWord,
		findParagraphIndexForWord,
	);
	// After the write commits: the rebuild's plan counts the saved position, so it sees today met too.
	onPositionSavedRef.current = (word: number) => {
		refetchDiscussionAsYouRead(word);
		if (goalPlan && liveToday(goalPlan, word, totalWordCount, furthestReadToday).isMet) {
			requestReminderSync();
		}
	};
	const [appearanceOpen, setAppearanceOpen] = useState(false);
	const openAppearanceOnMenuCloseRef = useRef(false);

	const discussionTicks = useMemo((): DiscussionTick[] => {
		if (!discussionItems?.length || totalWordCount <= 0) return [];
		const byPercent = new Map<number, DiscussionItem[]>();
		for (const item of discussionItems) {
			const pct = Math.min(100, Math.round((item.startWord / totalWordCount) * 100));
			byPercent.set(pct, [...(byPercent.get(pct) ?? []), item]);
		}
		return [...byPercent].map(([percent, items]) => ({
			key: String(percent),
			percent,
			count: items.length,
			onTap: () => setThreadIds(items.map((i) => i.id)),
		}));
	}, [discussionItems, totalWordCount]);
	const handleSelectionComment = useCallback(() => {
		const range = sel.selectionRange;
		if (!range) return;
		setCommentSelection({
			startWord: range.startWord,
			endWord: range.endWord,
			snippet: sel.extractRangeText(range.startWord, range.endWord),
		});
		sel.cancelSelection();
	}, [sel]);

	const handleSelectionShare = useCallback(() => {
		const row = highlightRows.find((h) => h.id === sel.selectionSavedId);
		if (!row) return;
		setSharingHighlight(row);
		sel.cancelSelection();
	}, [sel, highlightRows]);

	// Long-press → selection toolbar → "Look up" reads the word's rendered text
	// straight from the DOM (selection.startWord targets a word span via
	// `data-word`) and opens the dictionary modal.
	const handleSelectionLookup = useCallback(() => {
		const range = sel.selectionRange;
		if (!range) return;
		const span = document.querySelector<HTMLElement>(`span[data-word="${range.startWord}"]`);
		const raw = span?.textContent ?? "";
		const word = stripPunct(raw);
		if (word) openDictionaryModal(word);
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

	const handleAddWordToGlossary = useCallback(
		(word: string) => {
			closeDictionaryModal();
			findOrCreateGlossary(word);
		},
		[closeDictionaryModal, findOrCreateGlossary],
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

	// ── Mouse drag-to-select ──────────────────────────────────────────────
	// Desktop equivalent of long-press: pointerdown on a word + mousemove > 8px
	// starts selection mode. We then track the mouse across word spans until
	// mouseup to extend the selection range. The synthetic click that follows
	// mouseup is swallowed so it doesn't cancel the fresh selection via
	// handleWordTap.
	const { startSelection, extendSelectionTo } = sel;
	const handleWordMouseDragStart = useCallback(
		(wIdx: number, initialEvent: PointerEvent) => {
			const existing = findHighlightAt(wIdx);
			if (existing) {
				openHighlightEditor(existing);
				return;
			}
			startSelection(wIdx);

			// Extend the cursor's current position (the drag has already moved > 8px
			// past the start word by the time we get here - without this the initial
			// selection is just the start word until the next pointermove fires).
			const extendToPoint = (clientX: number, clientY: number) => {
				const wIdx = wordIndexAt(clientX, clientY);
				if (wIdx !== null) extendSelectionTo(wIdx);
			};
			extendToPoint(initialEvent.clientX, initialEvent.clientY);

			const onMove = (me: PointerEvent) => extendToPoint(me.clientX, me.clientY);
			const cleanup = () => {
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
				// No click follows when the release lands outside the window.
				window.addEventListener(
					"pointerdown",
					() => window.removeEventListener("click", swallow, true),
					{ once: true, capture: true },
				);
			};
			window.addEventListener("pointermove", onMove);
			window.addEventListener("pointerup", onEnd);
			window.addEventListener("pointercancel", cleanup);
		},
		[findHighlightAt, openHighlightEditor, startSelection, extendSelectionTo],
	);

	// ── RSVP helpers ─────────────────────────────────────────────────────

	const handleRsvpPositionChange = useCallback(
		(word: number) => {
			// RsvpView's unmount flush reports its old word after a switch to the
			// standard view has already placed the reader elsewhere.
			if (readerModeRef.current !== "rsvp") return;
			// Stepping RSVP words while listening picks where play continues; while
			// paused it is also reading, and saved like any other move.
			const readAloud = readAloudRef.current;
			if (readAloud?.isActive && readAloud.keepsPositionOnMove(word)) return;
			setProgressWord(word);
			lastWordRef.current = word;
			if (isRsvpPlayingRef.current) markPlaybackMove();
			else markLocalMove();
			savePosition(word, "rsvp", { scheduleSync: false });
			markActivityRef.current?.();
		},
		[savePosition, markLocalMove, markPlaybackMove],
	);

	/** Switch from RSVP back to the standard reader, positioning the
	 *  next-mounted view at the given word (consumed via initialWord on
	 *  remount). The actual scroll-vs-page choice happens at render time
	 *  based on paginationStyle. */
	const exitRsvpToStandard = useCallback(
		(word?: number) => {
			// Playback saves are throttled; pausing reports the displayed word while
			// RSVP reports are still accepted. With the voice speaking the engine never
			// plays, and that report would read as the reader moving away.
			if (!readAloudRef.current?.isActive) rsvpViewRef.current?.pause();
			// Ahead of the render: from here on this is the standard view, so the save
			// below (and RsvpView's unmount flush) follow standard-mode browse rules.
			readerModeRef.current = "standard";
			const target = word ?? lastWordRef.current ?? 0;
			lastWordRef.current = target;
			markLocalMove();
			setProgressWord(target);
			setReaderMode("standard");
			savePosition(target, "rsvp-exit");
		},
		[savePosition, markLocalMove],
	);

	/** A programmatic jump from any mode. From RSVP it lands in the standard
	 *  view, browsing like any other jump. */
	const navigateToWord = useCallback(
		(word: number) => {
			if (readerModeRef.current !== "rsvp") {
				jumpToWord(word);
				return;
			}
			const readAloud = readAloudRef.current;
			if (readAloud?.isActive) {
				rsvpViewRef.current?.showWord(word);
				if (readAloud.moveTo(word)) return;
				lastWordRef.current = word;
				markLocalMove();
				savePosition(word, "jump");
				return;
			}
			// Before the anchor is taken: playback saves are throttled, so the
			// displayed word may not have reached lastWordRef yet.
			rsvpViewRef.current?.pause();
			browse.enterForJump(word);
			setActiveWord(word);
			exitRsvpToStandard(word);
		},
		[jumpToWord, browse, exitRsvpToStandard, savePosition, markLocalMove],
	);

	// Moving on to the next chapter means the browsed spot was read.
	const handleNextChapter = useCallback(() => {
		browse.readFromHere();
		void chapterAdvance.tryAdvance();
	}, [browse, chapterAdvance]);

	const ttsVoices = dbSettings?.ttsVoices ?? DEFAULT_SETTINGS.TTS_VOICES;
	const ttsSpeech = useMemo(
		() => speechFor(dbSettings, book?.language ?? null),
		[dbSettings, book?.language],
	);
	const isFollowingVoiceRef = useRef(true);

	const handleSpokenWord = useCallback(
		(word: number) => {
			lastWordRef.current = word;
			settledWordRef.current = word;
			markPlaybackMove();
			// Also under RSVP, so switching back mid-playback doesn't show a stale word.
			ruler.show(word);
			if (readerModeRef.current === "rsvp") {
				rsvpViewRef.current?.followVoice(word);
				return;
			}
			markSpokenWord(word);
			if (!isFollowingVoiceRef.current) return;
			// A far-off word is reached by a jump, whose settle must not read as the reader looking away.
			if (scrollViewRef.current?.followWord?.(word)) stampJump();
		},
		[stampJump, markPlaybackMove, ruler],
	);

	const getReadAloudViewWord = useCallback(
		() => (viewContainerEl ? firstVisibleWordInView(viewContainerEl) : null),
		[viewContainerEl],
	);

	const handleSaveSpokenWord = useCallback(
		(word: number) => {
			setActiveWord(word);
			setProgressWord(word);
			savePosition(word, "read-aloud", { scheduleSync: false });
		},
		[savePosition],
	);

	// The spoken word is saved; the reader is left browsing what it was looking at.
	const handleReadAloudStopDetached = useCallback(
		(viewWord: number) => {
			if (readerModeRef.current === "rsvp") return;
			browse.enterForJump(viewWord);
			lastWordRef.current = viewWord;
			settledWordRef.current = viewWord;
		},
		[browse],
	);

	// Finished books start over rather than reading the last word and stopping again.
	const getReadAloudStartWord = useCallback(() => {
		const word = lastWordRef.current ?? 0;
		return word >= totalWordCount - 1 ? 0 : word;
	}, [totalWordCount]);

	const readAloud = useReadAloud({
		bookId: id,
		content,
		wordIndex,
		chapters,
		title: book?.title ?? "",
		author: book?.author ?? null,
		cover: contentRow?.coverImage ?? null,
		language: book?.language ?? null,
		speech: ttsSpeech,
		getStartWord: getReadAloudStartWord,
		getViewWord: getReadAloudViewWord,
		onWord: handleSpokenWord,
		onSavePosition: handleSaveSpokenWord,
		onStopWhileDetached: handleReadAloudStopDetached,
		onBeforeStart: browse.readFromHere,
		onBackToVoice: () => backToVoiceRef.current(),
		onFurthestRead: reportFurthestRead,
	});
	const isReadAloudActive = readAloud.status !== "off";

	// While the voice plays its highlight is the one marker; the underline shows again once
	// it pauses or stops, on the spoken word that handleSaveSpokenWord keeps in activeWord.
	const shownActiveWord = readAloud.status === "playing" ? NO_HIGHLIGHT : activeWord;
	// While the voice plays the ruler follows the spoken word instead (handleSpokenWord).
	useLayoutEffect(() => {
		if (readAloud.status !== "playing") ruler.show(activeWord);
	}, [ruler, activeWord, readAloud.status]);
	readAloudRef.current = {
		isActive: isReadAloudActive,
		isPlaying: readAloud.status === "playing",
		ownsPosition: readAloud.ownsPosition,
		keepsPositionOnMove: readAloud.keepsPositionOnMove,
		detach: readAloud.detach,
		moveTo: readAloud.moveTo,
		pause: readAloud.pause,
		viewWordRef: readAloud.viewWordRef,
	};
	isFollowingVoiceRef.current =
		readAloud.isFollowing && (dbSettings?.ttsFollow ?? DEFAULT_SETTINGS.TTS_FOLLOW);

	useEffect(() => {
		if (!isReadAloudActive) return;
		return () => markSpokenWord(null);
	}, [isReadAloudActive]);

	const rsvpVoice = useMemo(
		() =>
			isReadAloudActive
				? { isPlaying: readAloud.status === "playing", onToggle: readAloud.toggle }
				: null,
		[isReadAloudActive, readAloud.status, readAloud.toggle],
	);

	// A finger on the text, a wheel or a scroll key means the reader is looking elsewhere:
	// stop following at once, without waiting for the scroll to settle. Paused, it also
	// hands the reader the position, so a leave before the settle saves the scrolled spot.
	// Only real input: the voice's own follow scrolls must never count.
	useEffect(() => {
		const el = viewContainerEl;
		if (!el || !isReadAloudActive || readerMode === "rsvp") return;
		const isOnControls = (e: Event) =>
			e.target instanceof Element && e.target.closest(".read-aloud-controls") !== null;
		let touchOrigin: { x: number; y: number } | null = null;
		const onTouchStart = (e: TouchEvent) => {
			const touch = e.touches[0];
			touchOrigin = touch && !isOnControls(e) ? { x: touch.clientX, y: touch.clientY } : null;
		};
		// A tap jitters a few pixels; only a real drag is the reader looking elsewhere.
		const onTouchMove = (e: TouchEvent) => {
			const touch = e.touches[0];
			if (!touchOrigin || !touch) return;
			const distance = Math.hypot(touch.clientX - touchOrigin.x, touch.clientY - touchOrigin.y);
			if (distance < DETACH_DRAG_PX) return;
			touchOrigin = null;
			readAloudRef.current?.keepsPositionOnMove(null);
		};
		const onWheel = (e: WheelEvent) => {
			if (!isOnControls(e)) readAloudRef.current?.keepsPositionOnMove(null);
		};
		// The scrollbar: a press on the scroller itself, not on the text inside it.
		const onPointerDown = (e: PointerEvent) => {
			const scroller = el.querySelector(".reader-scroll-content")?.firstElementChild;
			if (scroller && e.target === scroller) {
				readAloudRef.current?.keepsPositionOnMove(null);
			}
		};
		const onKeyDown = (e: KeyboardEvent) => {
			if (!NATIVE_SCROLL_KEYS.has(e.key) || !isReaderKey(e)) return;
			readAloudRef.current?.keepsPositionOnMove(null);
		};
		el.addEventListener("touchstart", onTouchStart, { passive: true });
		el.addEventListener("touchmove", onTouchMove, { passive: true });
		el.addEventListener("wheel", onWheel, { passive: true });
		el.addEventListener("pointerdown", onPointerDown);
		window.addEventListener("keydown", onKeyDown);
		return () => {
			el.removeEventListener("touchstart", onTouchStart);
			el.removeEventListener("touchmove", onTouchMove);
			el.removeEventListener("wheel", onWheel);
			el.removeEventListener("pointerdown", onPointerDown);
			window.removeEventListener("keydown", onKeyDown);
		};
	}, [viewContainerEl, isReadAloudActive, readerMode]);

	// A tap or key turn has no drag to detach on, and its settle comes only after
	// the slide: a word spoken meanwhile would follow the voice back (TASK-221).
	const handlePageTurnStart = useCallback(() => {
		const readAloud = readAloudRef.current;
		if (!readAloud?.isActive) return;
		readAloud.keepsPositionOnMove(null);
		isFollowingVoiceRef.current = false;
	}, []);

	const handleBackToVoice = useCallback(() => {
		const word = readAloud.spokenWordRef.current;
		if (word !== null) {
			// The view goes back to the voice, so its word is the position again.
			lastWordRef.current = word;
			settledWordRef.current = word;
			browse.readFromHere();
		}
		readAloud.resumeFollowing();
		if (word === null) return;
		if (readerModeRef.current === "rsvp") {
			rsvpViewRef.current?.showWord(word);
			return;
		}
		stampJump();
		scrollViewRef.current?.jumpTo(word, { highlight: false, smooth: true });
	}, [readAloud.resumeFollowing, readAloud.spokenWordRef, stampJump, browse]);

	const [isSleepTimerOpen, setIsSleepTimerOpen] = useState(false);
	const [isVoiceSheetOpen, setIsVoiceSheetOpen] = useState(false);
	const sleepTimerItems = useMemo(
		() => [
			{ label: "Off", onSelect: () => readAloud.setSleepTimer(null) },
			...SLEEP_TIMER_MINUTES.map((minutes) => ({
				label: `${minutes} minutes`,
				onSelect: () => readAloud.setSleepTimer({ minutes }),
			})),
			...(chapters.length > 0
				? [{ label: "End of chapter", onSelect: () => readAloud.setSleepTimer("chapterEnd") }]
				: []),
		],
		[readAloud.setSleepTimer, chapters.length],
	);
	backToVoiceRef.current = handleBackToVoice;
	const handleVoiceSelect = useCallback(
		(voice: string | null) => {
			updateSetting(
				"ttsVoices",
				JSON.stringify(withVoice(parseVoiceChoices(ttsVoices), book?.language ?? null, voice)),
			);
			setIsVoiceSheetOpen(false);
		},
		[updateSetting, ttsVoices, book?.language],
	);

	const handleRsvpToggle = useCallback(() => {
		if (readerMode !== "rsvp") {
			// RSVP never browses: switching to it reads from the browsed spot.
			browse.readFromHere();
			// Use lastWordRef (word-level accurate from handleScrollEnd)
			// instead of progressWord (paragraph-level from handleScroll).
			const word = lastWordRef.current ?? 0;
			setProgressWord(word);
			setRsvpInitWord(word);
			setReaderMode("rsvp");
			setProgressBarVisible(true);
		} else {
			exitRsvpToStandard();
		}
	}, [readerMode, exitRsvpToStandard, browse]);

	const handleRsvpFinished = useCallback(() => {
		exitRsvpToStandard();
		// No-op for standalone books; navigates to next chapter for serials.
		void chapterAdvance.tryAdvance();
	}, [exitRsvpToStandard, chapterAdvance]);

	const handleRsvpWpmChange = useCallback(
		(wpm: number) => updateSetting("wpm", wpm),
		[updateSetting],
	);

	// ── Chapter jump ──────────────────────────────────────────────────────
	const handleJumpFirstMention = useCallback(
		(label: string) => {
			const wordIdx = findFirstMention(label, paragraphs, paragraphOffsets, wordIndex ?? null);
			if (wordIdx !== null) navigateToWord(wordIdx);
		},
		[paragraphs, paragraphOffsets, navigateToWord, wordIndex],
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
			if (wordIdx !== null) navigateToWord(wordIdx);
		},
		[paragraphs, paragraphOffsets, navigateToWord, activeWord, wordIndex],
	);

	const handleHighlightJump = useCallback(
		(h: { startWord: number }) => navigateToWord(h.startWord),
		[navigateToWord],
	);

	// ── Search jump ───────────────────────────────────────────────────────────
	// The search modal gives us a JS char offset (indexOf result). String-edge
	// case: convert char → byte → word via WordIndex before handing off.
	const handleSearchJump = useCallback(
		(charOffset: number) => {
			if (!content || !wordIndex) return;
			const byteOffset = utf8ByteLength(content.slice(0, charOffset));
			navigateToWord(wordIndex.wordOf(byteOffset));
		},
		[content, navigateToWord, wordIndex],
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
			sel.noteInputOpen ||
			appearanceOpen,
		scrollViewRef,
		rsvpViewRef,
		handleRsvpToggle,
		exitRsvpToStandard,
		hasSelection: sel.isSelecting && !sel.noteInputOpen,
		cancelSelection: sel.cancelSelection,
		volumeKeys: volumeKeysFor(dbSettings, isEinkMode),
		isReadingAloud: isReadAloudActive,
	});

	// ── Reading session tracking ──────────────────────────────────────────
	// `isReading` is the coarse "reader page is mounted with content". The
	// hook subscribes visibility + Capacitor App state itself for pause/resume;
	// `markActivity` is fed from scroll/page/RSVP callbacks so long-paragraph
	// reading (no position change for minutes) doesn't trigger spurious idle.
	const sessionMode: ReadingSessionMode =
		readerMode === "rsvp" ? "rsvp" : paginationStyle === "page" ? "page" : "scroll";
	const getReadingPosition = useCallback(() => browse.anchor ?? lastWordRef.current ?? 0, [browse]);
	const getRestoredPosition = useCallback(() => browse.anchor ?? lastWordRef.current, [browse]);
	const liveRead = discussionRead?.status === "in_progress" ? discussionRead : null;
	const liveMembers = useLiveReading({
		buddyReadId: liveRead?.id ?? null,
		getPosition: getRestoredPosition,
		mode: isReadAloudActive ? "listen" : sessionMode,
		dialWpm: rsvpSettings.wpm ?? null,
		isForeground,
		isOnline,
	});
	const buddy = useBuddyReadMarkers(liveRead?.id ?? null, totalWordCount, liveMembers);
	const readingNowCount = buddy.markers.filter((m) => m.live).length;
	const {
		markActivity: markReadingActivity,
		getDebugSnapshot,
		endSession,
		rewindSession,
		backfillSession,
		discardSession,
	} = useReadingSession({
		bookId: id,
		mode: sessionMode,
		isReading:
			!!content &&
			lastWordRef.current !== null &&
			!isSessionPaused &&
			browseAnchor === null &&
			// The voice owns the position while read aloud is on; listening is recorded from its own log.
			!isReadAloudActive,
		rsvpIsPlaying: isRsvpPlaying,
		getPosition: getReadingPosition,
		wpmSetting: rsvpSettings.wpm,
		onFurthestRead: reportFurthestRead,
	});
	useEffect(() => {
		markActivityRef.current = markReadingActivity;
		browseSessionRef.current = {
			end: endSession,
			discard: discardSession,
			rewind: rewindSession,
			backfill: backfillSession,
		};
	}, [markReadingActivity, endSession, discardSession, rewindSession, backfillSession]);

	// The reading sitting ends when read aloud starts: the words the voice speaks move
	// the position, and an open sitting would later credit them as read.
	useEffect(() => {
		if (isReadAloudActive) endSession();
	}, [isReadAloudActive, endSession]);

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
			if (readAloudRef.current?.isActive) readAloudRef.current.pause();
			else if (readerModeRef.current === "rsvp") rsvpViewRef.current?.pause();
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
			let flushed: Promise<unknown> = Promise.resolve();
			if (browse.isBrowsing) {
				// The DB already holds the anchor; the browsed spot must not leak into
				// the durable fallback below either. Still flush earlier saves.
				if (userMovedRef.current) pushSync().catch(() => {});
			} else if (word !== null && userMovedRef.current) {
				flushed = savePositionRef.current(word, "unmount", { scheduleSync: false });
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
			// The goal plan also counts the position, and a jump writes no session that would
			// refresh it. After the flush commits, or the refetch reads the old position.
			const goalPlans = statsKeys.goalPlansOf(id);
			flushed.catch(() => {}).then(() => qcRef.current.invalidateQueries({ queryKey: goalPlans }));
		};
	}, [browse]);

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
			if (browse.isBrowsing) return;
			const word = lastWordRef.current;
			if (word !== null && userMovedRef.current) {
				savePositionRef.current(word, "pagehide", { scheduleSync: false });
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
	}, [browse]);

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
	const browseAnchorPct = browseAnchor !== null ? percentOfBook(browseAnchor) : 0;
	const browseAnchorTick = browseAnchor !== null && (
		<div className="reader-browse-anchor-row" aria-hidden>
			<div className="reader-browse-anchor" style={{ left: `${browseAnchorPct}%` }} />
		</div>
	);
	const isProgressCollapsed = !progressBarVisible && readerMode !== "rsvp";
	const isShowingSkeleton =
		chapterFetch.kind !== "locked" &&
		chapterFetch.kind !== "error" &&
		(contentPending ||
			imagesPending ||
			!content ||
			!wordIndex ||
			// RSVP sets its word in its own monospace face.
			(readerMode !== "rsvp" && !readerFont) ||
			chapterFetch.kind === "loading");

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
			onNext={handleNextChapter}
			onPrev={() => void chapterAdvance.tryRetreat()}
		/>
	);

	const overflowSourceUrl =
		book.chapterSourceUrl ??
		book.sourceUrl ??
		(book.catalogId ? externalSourceUrl(book.catalogId) : null);

	return (
		<div className={`reader-theme-${theme} flex h-screen flex-col bg-background text-foreground`}>
			<header className="flex shrink-0 flex-col border-border border-b bg-background/95 pt-[var(--safe-top)] backdrop-blur">
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
								onClick={handleNextChapter}
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
					{goalPlan && goalToday && (
						<GoalChip
							plan={goalPlan}
							today={goalToday}
							onOpenDetails={() => history.push(`/tabs/library/book/${book.id}`)}
						/>
					)}
					{IS_READ_ALOUD_SUPPORTED && (
						<Button
							variant="ghost"
							size="icon"
							onClick={readAloud.toggle}
							disabled={!wordIndex}
							aria-label={readAloud.status === "playing" ? "Pause listening" : "Listen"}
							className={isReadAloudActive ? "text-primary" : undefined}
						>
							{readAloud.status === "playing" ? <Pause /> : <Headphones />}
						</Button>
					)}
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
						onClick={() => setAnnotationsOpen(true)}
						disabled={!content}
						aria-label="Annotations"
					>
						<Bookmark />
					</Button>
					<DropdownMenu>
						<AppearancePopover
							open={appearanceOpen}
							onOpenChange={setAppearanceOpen}
							anchor={
								<span className="inline-flex">
									<DropdownMenuTrigger asChild>
										<Button variant="ghost" size="icon">
											<MoreVertical />
											{/* Text, not aria-label: Android reads a menu button's text and drops its
											    aria-label, so TalkBack found it unnamed (TASK-205.13). */}
											<span className="sr-only">More actions</span>
										</Button>
									</DropdownMenuTrigger>
								</span>
							}
						/>
						<DropdownMenuContent
							align="end"
							className="w-64 p-1.5"
							// Opened once the menu has fully closed: earlier, the menu's own
							// focus moves while closing read as the popover losing focus.
							onCloseAutoFocus={(e) => {
								if (!openAppearanceOnMenuCloseRef.current) return;
								openAppearanceOnMenuCloseRef.current = false;
								e.preventDefault();
								setAppearanceOpen(true);
							}}
						>
							<DropdownMenuItem
								className={MENU_ITEM_CLASS}
								onSelect={() => setSearchOpen(true)}
								disabled={!content}
							>
								<Search />
								<span>Search</span>
							</DropdownMenuItem>
							<DropdownMenuItem
								className={MENU_ITEM_CLASS}
								onSelect={() => {
									openAppearanceOnMenuCloseRef.current = true;
								}}
							>
								<Type />
								<span>Appearance</span>
							</DropdownMenuItem>
							{IS_READ_ALOUD_SUPPORTED && (
								<DropdownMenuItem
									className={MENU_ITEM_CLASS}
									onSelect={() => history.push("/tabs/settings/read-aloud")}
								>
									<Headphones />
									<span>Listen settings</span>
								</DropdownMenuItem>
							)}
							{overflowSourceUrl && (
								<DropdownMenuItem
									className={MENU_ITEM_CLASS}
									onSelect={() => {
										void Browser.open({ url: overflowSourceUrl });
									}}
								>
									<ExternalLink />
									<span>Open on {series ? providerLabel(series.provider) : "website"}</span>
								</DropdownMenuItem>
							)}
							<DropdownMenuItem
								className={MENU_ITEM_CLASS}
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
				// clip, not hidden: nothing may scroll this box, not even screen-reader focus.
				// min-h-0: a clip box is no scroll container, so as a flex item it would
				// otherwise grow to its content (RSVP's tall spacer) past the screen.
				className="relative min-h-0 flex-1 overflow-clip"
				data-testid="reader-view"
			>
				<ReaderAnnouncer />
				{isRulerShown && <ReadingRulerOverlay ruler={ruler} />}
				{/* Screen readers can't drive RSVP or page turns; read-aloud is the way to listen. */}
				{IS_READ_ALOUD_SUPPORTED && (readerMode === "rsvp" || paginationStyle === "page") && (
					<p className="sr-only">
						{readerMode === "rsvp"
							? "This view flashes the book one word at a time."
							: "This view shows the book a page at a time."}{" "}
						To listen to the book, use the Listen button at the top.
					</p>
				)}
				{chapterFetch.kind === "locked" ? (
					<ChapterStateOverlay status="locked" />
				) : chapterFetch.kind === "error" ? (
					<ChapterStateOverlay
						status="error"
						reason={chapterFetch.reason}
						provider={series?.provider}
						onRetry={chapterFetch.retry}
					/>
				) : isShowingSkeleton ? (
					<ReaderSkeleton />
				) : readerMode === "rsvp" ? (
					<RsvpView
						ref={rsvpViewRef}
						content={content ?? ""}
						initialWord={rsvpInitWord}
						settings={rsvpSettings}
						fontSize={readerFontSize}
						onPositionChange={handleRsvpPositionChange}
						onFinished={handleRsvpFinished}
						onWpmChange={handleRsvpWpmChange}
						onLookup={openDictionaryModal}
						bookWordIndex={wordIndex}
						linkHrefAt={findLinkAt}
						onLinkTap={handleLinkTap}
						isSessionPaused={isSessionPaused}
						voice={rsvpVoice}
						onPlayingChange={setIsRsvpPlaying}
					/>
				) : paginationStyle === "page" ? (
					<PageView
						ref={scrollViewRef}
						key={`page-${id}`}
						paragraphs={paragraphs}
						paragraphStartWords={paragraphStartWords}
						entriesByParagraph={entriesByParagraph}
						chapterHeadingByParagraph={chapterHeadingByParagraph}
						figuresByParagraph={figureMap.byParagraph}
						trailingFigures={figureMap.trailing}
						totalWords={totalWordCount}
						initialWord={lastWordRef.current ?? seedWord ?? 0}
						fontSize={readerFontSize}
						fontFamily={readerFont?.family ?? DEFAULT_SETTINGS.READER_FONT_FAMILY}
						isBold={readerFont?.isBold ?? false}
						lineSpacing={readerLineSpacing}
						margin={readerMargin}
						textSpacing={textSpacing}
						textAlign={textAlign}
						showActiveWordUnderline={readerActiveWordUnderline}
						lang={hyphenationLang(book.language)}
						animatePageTurns={pageTurnAnimation}
						followFinger={!isEinkMode}
						activeWord={shownActiveWord}
						highlightsByParagraph={sel.highlightsByParagraph}
						glossaryByParagraph={glossaryByParagraph}
						linksByParagraph={linksByParagraph}
						discussionByParagraph={discussionByParagraph}
						goalDivider={goalDivider}
						selectionRange={sel.selectionRange}
						isSelecting={isSelecting}
						onWordTap={handlePageWordTap}
						onWordLongPress={sel.handleWordLongPress}
						onWordLongPressDrag={sel.extendSelectionTo}
						onWordMouseDragStart={handleWordMouseDragStart}
						onCancelSelection={sel.cancelSelection}
						onPositionSettle={handleScrollPositionSettle}
						onMotion={onRulerMotion}
						onColumns={onRulerColumns}
						onInitialActiveOffset={handleSetActiveWord}
						onTap={handleToggleProgressBar}
						onHideProgressBar={handleHideProgressBar}
						onTurnStart={handlePageTurnStart}
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
						figuresByParagraph={figureMap.byParagraph}
						trailingFigures={figureMap.trailing}
						findParagraphIndexForWord={findParagraphIndexForWord}
						initialWord={lastWordRef.current ?? seedWord ?? 0}
						getAnchorWord={getScrollAnchorWord}
						fontSize={readerFontSize}
						fontFamily={readerFont?.family ?? DEFAULT_SETTINGS.READER_FONT_FAMILY}
						isBold={readerFont?.isBold ?? false}
						lineSpacing={readerLineSpacing}
						margin={readerMargin}
						textSpacing={textSpacing}
						textAlign={textAlign}
						showActiveWordUnderline={readerActiveWordUnderline}
						lang={hyphenationLang(book.language)}
						activeWord={shownActiveWord}
						highlightsByParagraph={sel.highlightsByParagraph}
						glossaryByParagraph={glossaryByParagraph}
						linksByParagraph={linksByParagraph}
						discussionByParagraph={discussionByParagraph}
						goalDivider={goalDivider}
						selectionRange={sel.selectionRange}
						onWordTap={handleWordTap}
						onWordLongPress={sel.handleWordLongPress}
						onWordLongPressDrag={sel.extendSelectionTo}
						onWordMouseDragStart={handleWordMouseDragStart}
						onPositionSettle={handleScrollPositionSettle}
						onInitialActiveOffset={handleSetActiveWord}
						onProgressChange={handleSetProgressWord}
						onHighlightClear={handleScrollHighlightClear}
						onHideProgressBar={handleHideProgressBar}
						onTap={handleScrollTap}
						isSelecting={isSelecting}
						syncSelectionHandles={syncSelectionHandles}
						isScrubbingRef={isScrubbingRef}
						isScrubbing={scrub.isDragging}
						footer={advanceFooter}
					/>
				)}

				{/* ── Progress bar ── */}
				{/* Collapsed, the bar rests as a thin line so progress is always in view. */}
				{isProgressCollapsed ? (
					!isShowingSkeleton && (
						<div className="reader-progress-bar reader-progress-bar--collapsed" aria-hidden>
							<BuddyReadMarkers
								markers={buddy.markers}
								myWord={progressWord}
								approximate={buddy.approximate}
								isCollapsed
							/>
							{browseAnchorTick}
							<div className="reader-progress-fill-track">
								<div className="reader-progress-fill" style={{ width: `${progressPct}%` }} />
							</div>
						</div>
					)
				) : (
					<div
						ref={scrub.progressBarRef}
						className="reader-progress-bar"
						onPointerDown={scrub.handleProgressPointerDown}
						onPointerMove={scrub.handleProgressPointerMove}
						onPointerUp={scrub.handleProgressPointerUp}
						onPointerCancel={scrub.handleProgressPointerCancel}
					>
						{scrub.isDragging && (
							<div
								className="reader-scrub-bubble"
								style={{ left: `clamp(70px, ${progressPct}%, calc(100% - 70px))` }}
								role="status"
							>
								{currentChapterIndex >= 0 && (
									<span className="reader-scrub-bubble-chapter">
										{chapters[currentChapterIndex].title}
									</span>
								)}
								<span>{Math.round(progressPct)}%</span>
							</div>
						)}
						<BuddyReadMarkers
							markers={buddy.markers}
							myWord={progressWord}
							approximate={buddy.approximate}
							isCollapsed={false}
						/>
						{browseAnchorTick}
						{/* The slider role sits on the track, not the bar: a slider is a leaf, and
						    assistive tech would not reach the marker buttons inside it. */}
						{/* biome-ignore lint/a11y/useFocusableInteractive: scrubber */}
						<div
							className="reader-progress-fill-track"
							aria-label="Reading progress"
							role="slider"
							aria-valuenow={Math.round(progressPct)}
							aria-valuemin={0}
							aria-valuemax={100}
						>
							<div className="reader-progress-fill" style={{ width: `${progressPct}%` }} />
						</div>
						<DiscussionTicks ticks={discussionTicks} />
						<div className="reader-progress-label">
							<span>
								{Math.round(progressPct)}%
								{bookMinutesRemaining > 0 && <> · {formatReadingTime(bookMinutesRemaining)} left</>}
								{readingNowCount > 0 && (
									<>
										{" · "}
										<span className="reader-buddy-live-dot" /> {readingNowCount} reading
									</>
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

				{browseAnchor !== null && readerMode !== "rsvp" && !isShowingSkeleton && (
					<BrowseBar
						anchorPct={browseAnchorPct}
						onBack={browse.back}
						onReadFromHere={browse.readFromHere}
					/>
				)}

				{isReadAloudActive && !isShowingSkeleton && (
					<ReadAloudControls
						status={readAloud.status}
						wpm={ttsSpeech.wpm}
						measuredWpm={readAloud.measuredWpm}
						sleepTimer={readAloud.sleepTimer}
						isFollowing={readAloud.isFollowing}
						onTogglePlay={readAloud.toggle}
						onSkip={readAloud.skip}
						onWpmChange={(wpm) => updateSetting("ttsWpm", wpm)}
						onOpenSleepTimer={() => setIsSleepTimerOpen(true)}
						onOpenVoice={() => setIsVoiceSheetOpen(true)}
						onStop={readAloud.stop}
						onBackToVoice={handleBackToVoice}
						onReadFromView={readAloud.readFromView}
					/>
				)}

				{isSessionPaused && <SessionPauseOverlay onResume={() => setIsSessionPaused(false)} />}
			</div>

			{/* Selection toolbar + handles (fixed position, sync'd by hook). */}
			<SelectionOverlay
				isSelecting={sel.isSelecting}
				isHidden={sel.noteInputOpen}
				step={sel.selectionSavedId ? "styled" : "actions"}
				isSingleWord={
					!!sel.selectionRange && sel.selectionRange.startWord === sel.selectionRange.endWord
				}
				selectionColor={sel.selectionColor}
				toolbarRef={sel.toolbarRef}
				startHandleRef={sel.startHandleRef}
				endHandleRef={sel.endHandleRef}
				onHighlight={sel.handleSelectionHighlight}
				onColorChange={sel.handleSelectionColorChange}
				onNote={sel.handleSelectionNote}
				onLookup={handleSelectionLookup}
				onAddToGlossary={handleAddToGlossary}
				onDelete={sel.handleSelectionDelete}
				onComment={discussionRead ? handleSelectionComment : undefined}
				onShare={discussionRead ? handleSelectionShare : undefined}
				onStartHandlePointerDown={sel.handleStartHandlePointerDown}
				onEndHandlePointerDown={sel.handleEndHandlePointerDown}
			/>

			{/* ── Merged annotations sheet (Contents / Highlights / Glossary) ── */}
			<AnnotationsSheet
				isOpen={annotationsOpen}
				onClose={() => setAnnotationsOpen(false)}
				theme={theme}
				chapters={chapters}
				currentChapterIndex={currentChapterIndex}
				onJumpChapter={navigateToWord}
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
				browse={
					readerMode === "rsvp"
						? undefined
						: {
								isBrowsing: browseAnchor !== null,
								onToggle: browseAnchor === null ? browse.start : browse.back,
							}
				}
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
				lang={book.language}
				onClose={closeDictionaryModal}
				onSearch={handleDictSearch}
				onAddToGlossary={handleAddWordToGlossary}
				theme={theme}
			/>

			{discussionRead && (
				<>
					<DiscussionThreadSheet
						buddyReadId={discussionRead.id}
						items={threadItems}
						onClose={() => setThreadIds(null)}
						theme={theme}
					/>
					<CommentComposerSheet
						buddyReadId={discussionRead.id}
						selection={commentSelection}
						onClose={() => setCommentSelection(null)}
						theme={theme}
					/>
					<ShareHighlightSheet
						buddyReadId={discussionRead.id}
						highlight={sharingHighlight}
						text={
							sharingHighlight
								? sel.extractRangeText(sharingHighlight.startWord, sharingHighlight.endWord)
								: ""
						}
						syncNow={syncNow}
						onClose={() => setSharingHighlight(null)}
						theme={theme}
					/>
				</>
			)}

			<ActionSheet
				open={isSleepTimerOpen}
				onOpenChange={setIsSleepTimerOpen}
				title="Stop listening after"
				items={sleepTimerItems}
			/>
			<VoiceSheet
				open={isVoiceSheetOpen}
				onOpenChange={setIsVoiceSheetOpen}
				language={book.language ?? null}
				languageLabel={languageName(book.language ?? null)}
				selected={ttsSpeech.voice}
				speech={ttsSpeech}
				onSelect={handleVoiceSelect}
				className={`reader-theme-${theme}`}
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
						<DrawerTitle className="flex-1">Note</DrawerTitle>
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
