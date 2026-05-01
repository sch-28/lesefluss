/**
 * `queryHooks` - react-query wrappers for all local DB operations.
 *
 * Same ergonomics as the `queries` object, but returns react-query
 * `UseQueryResult` / `UseMutationResult` instead of bare promises.
 *
 * Usage:
 *   import { queryHooks } from "../services/db/hooks";
 *
 *   // Reads
 *   const { data, isPending } = queryHooks.useBooks();
 *   const { data: book }      = queryHooks.useBook(id);
 *   const { data: content }   = queryHooks.useBookContent(id);
 *   const { data: settings }  = queryHooks.useSettings();
 *
 *   // Writes
 *   const importBook  = queryHooks.useImportBook();
 *   importBook.mutate({ onProgress: (pct) => setProgress(pct) });
 *
 *   const deleteBook  = queryHooks.useDeleteBook();
 *   deleteBook.mutate(book);
 *
 *   const saveSettings = queryHooks.useSaveSettings();
 *   saveSettings.mutate({ wpm: 400 });
 *
 * Query keys are re-exported for callers that need manual invalidation.
 */

import { bookHooks } from "./use-books";
import { dangerZoneHooks } from "./use-danger-zone";
import { glossaryHooks } from "./use-glossary";
import { highlightHooks } from "./use-highlights";
import { serialHooks } from "./use-serials";
import { seriesHooks } from "./use-series";
import { settingsHooks } from "./use-settings";
import { statsHooks } from "./use-stats";

export { bookKeys, glossaryKeys, serialKeys, settingsKeys, statsKeys } from "./query-keys";

export const queryHooks = {
	// ── Books ──────────────────────────────────────────────────────────────
	/** All books list + cover images map, fetched in parallel. */
	useBooks: bookHooks.useBooks,

	/** Single book metadata. */
	useBook: bookHooks.useBook,

	/** Single book content (large text, cover base64, chapters). */
	useBookContent: bookHooks.useBookContent,

	/** Mutation: import a book from the file picker. */
	useImportBook: bookHooks.useImportBook,

	/** Mutation: import a book from the system clipboard. */
	useImportBookFromClipboard: bookHooks.useImportBookFromClipboard,

	/** Mutation: import a book from a URL (proxied + readability-extracted). */
	useImportBookFromUrl: bookHooks.useImportBookFromUrl,

	/** Mutation: import a serial/web-novel from a URL (creates series + pending chapters). */
	useImportSerialFromUrl: bookHooks.useImportSerialFromUrl,

	/** Mutation: import a book from a plain-text string (share intent). */
	useImportBookFromText: bookHooks.useImportBookFromText,

	/** Mutation: import a book from an in-memory Blob ("Open with" / share-sheet). */
	useImportBookFromBlob: bookHooks.useImportBookFromBlob,

	/** Mutation: delete a book (disk + DB). */
	useDeleteBook: bookHooks.useDeleteBook,

	// ── Settings ───────────────────────────────────────────────────────────
	/** The single RSVP settings row. */
	useSettings: settingsHooks.useSettings,

	/** Mutation: persist a settings patch to SQLite. */
	useSaveSettings: settingsHooks.useSaveSettings,

	// ── Highlights ─────────────────────────────────────────────────────────
	/** All highlights for a book, ordered by position. */
	useHighlights: highlightHooks.useHighlights,

	/** Mutation: add a new highlight. */
	useAddHighlight: highlightHooks.useAddHighlight,

	/** Mutation: update highlight color/note. */
	useUpdateHighlight: highlightHooks.useUpdateHighlight,

	/** Mutation: delete a highlight. */
	useDeleteHighlight: highlightHooks.useDeleteHighlight,

	// ── Glossary ──────────────────────────────────────────────────────────
	/** Glossary entries visible from a book (book-scoped + global). */
	useGlossary: glossaryHooks.useGlossary,

	/** Mutation: add a glossary entry. */
	useAddGlossaryEntry: glossaryHooks.useAddGlossaryEntry,

	/** Mutation: update a glossary entry. */
	useUpdateGlossaryEntry: glossaryHooks.useUpdateGlossaryEntry,

	/** Mutation: delete a glossary entry. */
	useDeleteGlossaryEntry: glossaryHooks.useDeleteGlossaryEntry,

	// ── Serials ───────────────────────────────────────────────────────────
	/** Free-text search across every serial provider. */
	useSearchSerials: serialHooks.useSearchSerials,

	/** Popular/trending shelf across providers — drives the empty-search state. */
	usePopularSerials: serialHooks.usePopularSerials,

	/** All series visible in the library (excludes tombstones). */
	useSeriesList: seriesHooks.useSeriesList,

	/** Single series row by id. */
	useSeries: seriesHooks.useSeries,

	/** Map<seriesId, chapterCount> in one query — drives every SeriesCard's badge. */
	useSeriesChapterCounts: seriesHooks.useSeriesChapterCounts,

	/** Map<seriesId, SeriesActivity>. Drives library filter+sort for series cards. */
	useSeriesActivity: seriesHooks.useSeriesActivity,

	/** Mutation: soft-delete a series + tombstone all its chapter rows. */
	useDeleteSeries: seriesHooks.useDeleteSeries,

	/** Ordered chapter rows for a series (used by SeriesDetail chapter list). */
	useSeriesChapters: seriesHooks.useSeriesChapters,

	/**
	 * Fire-on-mount hook: polls the upstream TOC and inserts newly published
	 * chapters as `pending` rows. Returns `{ isSyncing }` for a subtle UI indicator.
	 */
	useChapterListSync: seriesHooks.useChapterListSync,

	// ── Stats ─────────────────────────────────────────────────────────────
	useStatsPeriodTotals: statsHooks.usePeriodTotals,
	useStatsStreak: statsHooks.useStreak,
	useStatsTopBooks: statsHooks.useTopBooks,
	useStatsWeeklyWpm: statsHooks.useWeeklyWpm,
	useStatsHourHistogram: statsHooks.useHourHistogram,
	useStatsPersonality: statsHooks.usePersonality,
	useStatsSessionCount: statsHooks.useSessionCount,
	useStatsBook: statsHooks.useBookStats,

	// ── Danger Zone (bulk deletions) ───────────────────────────────────────
	/** Mutation: hard-delete every highlight on this device + sync. */
	useDeleteAllHighlights: dangerZoneHooks.useDeleteAllHighlights,

	/** Mutation: hard-delete every glossary entry (including global) + sync. */
	useDeleteAllGlossary: dangerZoneHooks.useDeleteAllGlossary,

	/** Mutation: wipe reading sessions on server + locally. */
	useDeleteAllReadingSessions: dangerZoneHooks.useDeleteAllReadingSessions,

	/** Mutation: tombstone every series + book and clean up files on disk. */
	useDeleteLibrary: dangerZoneHooks.useDeleteLibrary,

	/** Mutation: run every danger-zone deletion in sequence (preserves auth/settings). */
	useDeleteEverything: dangerZoneHooks.useDeleteEverything,
};
