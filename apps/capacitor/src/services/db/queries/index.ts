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
	deleteEntriesByBook,
	deleteEntry,
	getAllEntries,
	getEntriesForBook,
	updateEntry,
} from "./glossary";
import {
	addHighlight,
	deleteHighlight,
	deleteHighlightsByBook,
	getAllHighlights,
	getHighlightsByBook,
	updateHighlight,
} from "./highlights";
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

	// Glossary
	getEntriesForBook,
	getAllEntries,
	addEntry,
	updateEntry,
	deleteEntry,
	deleteEntriesByBook,

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
