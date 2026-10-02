/**
 * Public API for serial-scrapers. Thin compositions only — implementations
 * live in pipeline / commit / registry.
 */

export { removeSerial } from "./commit";
export { chapterCountLabel, providerLabel } from "./labels";
export {
	fetchAndStoreChapter,
	pollChapterList,
	previewSerial,
	runSerialImport as importSerialFromUrl,
} from "./pipeline";
export type { SearchAllResult } from "./registry";
export {
	isSerialUrl,
	popularAll as popularSerials,
	providerCapabilities,
	searchAll as searchSerials,
} from "./registry";
export type {
	ChapterFetchResult,
	ChapterRef,
	PopularWindow,
	ProviderCapabilities,
	ProviderId,
	SearchResult,
	SerialScraper,
	SeriesDetails,
	SeriesMetadata,
	SeriesStatus,
} from "./types";
export { normalizeSeriesUrl } from "./utils/series-url";
