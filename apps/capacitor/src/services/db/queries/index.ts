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
	parseChapters,
	setActiveBook,
	updateBook,
} from "./books";
import { getLastDevice, saveDevice } from "./devices";
import {
	addHighlight,
	deleteHighlight,
	deleteHighlightsByBook,
	getAllHighlights,
	getHighlightsByBook,
	updateHighlight,
} from "./highlights";
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
	getBook,
	getBookByCatalogId,
	getBookContent,
	getBookCovers,
	addBookWithContent,
	parseChapters,
	updateBook,
	setActiveBook,
	deleteBook,

	// Highlights
	getHighlightsByBook,
	getAllHighlights,
	addHighlight,
	updateHighlight,
	deleteHighlight,
	deleteHighlightsByBook,
};
