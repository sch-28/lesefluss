/**
 * Unified query object - import `queries` anywhere and call e.g. `queries.getSettings()`.
 * Individual modules stay as pure functions for testability; this just re-exports them
 * under one namespace so callers have a single import.
 */
import {
	addBookWithContent,
	deleteBook,
	getBook,
	getBookByCatalogId,
	getBookContent,
	getBookCovers,
	getBooks,
	getBooksForSync,
	hardDeleteBook,
	parseChapters,
	setActiveBook,
	updateBook,
} from "./books";
import { getLastDevice, saveDevice } from "./devices";
import {
	addEntry,
	deleteAllEntries,
	deleteEntriesByBook,
	deleteEntry,
	getAllEntries,
	getEntriesForBook,
	updateEntry,
} from "./glossary";
import {
	addHighlight,
	deleteAllHighlights,
	deleteHighlight,
	deleteHighlightsByBook,
	getAllHighlights,
	getHighlightsByBook,
	updateHighlight,
} from "./highlights";
import {
	addReadingSession,
	deleteAllReadingSessions,
	getAllReadingSessions,
	getReadingSessionsByBook,
	upsertReadingSession,
} from "./reading-sessions";
import {
	addSeries,
	addSeriesWithChapters,
	cleanupOrphanedChapterRows,
	deleteSeries,
	getNextChapter,
	getPreviousChapter,
	getSeries,
	getSeriesActivity,
	getSeriesChapterCounts,
	getSeriesChapters,
	getSeriesEntryChapter,
	getSeriesForSync,
	getSeriesList,
	hardDeleteChaptersBySeriesId,
	hardDeleteSeries,
	insertChapters,
	setChapterContent,
	updateChapterIndex,
	updateSeries,
} from "./series";
import { getSettings, saveSettings } from "./settings";
import {
	getBookStats,
	getHourHistogram,
	getPeriodTotals,
	getPersonalityStats,
	getSessionCount,
	getStreak,
	getTopBooks,
	getWeeklyWpm,
} from "./stats";

export const queries = {
	// Settings
	getSettings,
	saveSettings,

	// Devices
	saveDevice,
	getLastDevice,

	// Books
	getBooks,
	getBooksForSync,
	getBook,
	getBookByCatalogId,
	getBookContent,
	getBookCovers,
	addBookWithContent,
	parseChapters,
	updateBook,
	setActiveBook,
	deleteBook,
	hardDeleteBook,

	// Highlights
	getHighlightsByBook,
	getAllHighlights,
	addHighlight,
	updateHighlight,
	deleteHighlight,
	deleteHighlightsByBook,
	deleteAllHighlights,

	// Reading sessions
	getAllReadingSessions,
	getReadingSessionsByBook,
	addReadingSession,
	upsertReadingSession,
	deleteAllReadingSessions,

	// Stats
	getPeriodTotals,
	getStreak,
	getTopBooks,
	getWeeklyWpm,
	getHourHistogram,
	getPersonalityStats,
	getSessionCount,
	getBookStats,

	// Glossary
	getEntriesForBook,
	getAllEntries,
	addEntry,
	updateEntry,
	deleteEntry,
	deleteEntriesByBook,
	deleteAllEntries,

	// Series
	getSeries,
	getSeriesList,
	getSeriesForSync,
	addSeries,
	addSeriesWithChapters,
	insertChapters,
	setChapterContent,
	updateSeries,
	updateChapterIndex,
	deleteSeries,
	hardDeleteSeries,
	hardDeleteChaptersBySeriesId,
	cleanupOrphanedChapterRows,
	getSeriesChapters,
	getSeriesChapterCounts,
	getSeriesActivity,
	getSeriesEntryChapter,
	getNextChapter,
	getPreviousChapter,
};
