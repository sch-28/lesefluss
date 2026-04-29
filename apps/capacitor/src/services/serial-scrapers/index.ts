/**
 * Public API for serial-scrapers. Thin compositions only — implementations
 * live in pipeline / commit / registry.
 */

export { removeSerial } from "./commit";
export { chapterCountLabel, providerLabel } from "./labels";
export {
	fetchAndStoreChapter,
	pollChapterList,
	runSerialImport as importSerialFromUrl,
} from "./pipeline";
export type { SearchAllResult } from "./registry";
export {
	isSerialUrl,
	popularAll as popularSerials,
	searchAll as searchSerials,
} from "./registry";
export type {
	ChapterFetchResult,
	ChapterRef,
	ProviderId,
	SearchResult,
	SerialScraper,
	SeriesMetadata,
} from "./types";
