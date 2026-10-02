import { log } from "../../utils/log";
import { queries } from "../db/queries";
import type { Series } from "../db/schema";
import { commitChapter, commitSeries, syncChapterList } from "./commit";
import { detectScraper, scrapersById } from "./registry";
import type { ChapterFetchResult, SearchResult } from "./types";
import { normalizeSeriesUrl } from "./utils/series-url";

const inFlightImports = new Map<string, Promise<Series>>();

/**
 * Import a brand-new series. Sole caller of `commitSeries`.
 *
 * Throws:
 *   - `Error("NO_SCRAPER")` — the URL doesn't match any registered provider.
 */
export function runSerialImport(url: string): Promise<Series> {
	// Two entry points (a card's quick add and the preview) can fire for the same
	// series before either commits; share one import instead of writing two.
	const key = normalizeSeriesUrl(url);
	const pending = inFlightImports.get(key);
	if (pending) return pending;
	const run = importSeries(url).finally(() => inFlightImports.delete(key));
	inFlightImports.set(key, run);
	return run;
}

async function importSeries(url: string): Promise<Series> {
	const scraper = detectScraper(url);
	if (!scraper) throw new Error("NO_SCRAPER");

	log("serial-scrapers", `import via ${scraper.id}: ${url}`);
	const meta = await scraper.fetchSeriesMetadata(url);
	const chapters = await scraper.fetchChapterList(meta.tocUrl);
	if (chapters.length === 0) throw new Error("NO_CHAPTERS");
	return commitSeries(meta, chapters);
}

/**
 * Metadata for a series that is not in the library, from its URL alone. Backs
 * the preview page when it is opened from a link rather than a search result.
 * Skips the chapter list: the preview does not show it and it can be a slow,
 * multi-page fetch.
 *
 * Throws `Error("NO_SCRAPER")` for URLs no provider handles.
 */
export async function previewSerial(url: string): Promise<SearchResult> {
	const scraper = detectScraper(url);
	if (!scraper) throw new Error("NO_SCRAPER");
	const meta = await scraper.fetchSeriesMetadata(url);
	return {
		title: meta.title,
		author: meta.author,
		description: meta.description,
		coverImage: meta.coverImage,
		chapterCount: null,
		sourceUrl: meta.sourceUrl,
		provider: meta.provider,
		details: meta.details,
	};
}

/**
 * Lazy chapter fetch. Called when the reader opens a `pending` chapter.
 * Sole caller of `commitChapter`.
 */
export async function fetchAndStoreChapter(chapterId: string): Promise<ChapterFetchResult> {
	const chapter = await queries.getBook(chapterId);
	if (!chapter?.seriesId || chapter.chapterIndex === null) {
		throw new Error("NOT_A_CHAPTER");
	}
	const series = await queries.getSeries(chapter.seriesId);
	if (!series) throw new Error("SERIES_MISSING");

	const scraper = scrapersById[series.provider];
	if (!scraper) throw new Error("NO_SCRAPER");

	const result = await scraper.fetchChapterContent({
		index: chapter.chapterIndex,
		title: chapter.title,
		sourceUrl: chapter.chapterSourceUrl ?? series.sourceUrl,
	});
	await commitChapter(chapterId, result);
	return result;
}

/**
 * Poll the upstream TOC for a series and sync any new chapters into the DB.
 * Sole caller of `syncChapterList`. Called by `useChapterListSync` when
 * SeriesDetail mounts.
 *
 * Throws:
 *   - `Error("SERIES_MISSING")` — seriesId not found in the DB.
 *   - `Error("NO_SCRAPER")`     — provider has no registered adapter.
 */
export async function pollChapterList(seriesId: string): Promise<{ added: number }> {
	const series = await queries.getSeries(seriesId);
	if (!series) throw new Error("SERIES_MISSING");

	const scraper = scrapersById[series.provider];
	if (!scraper) throw new Error("NO_SCRAPER");

	log("serial-scrapers", `polling TOC for series ${seriesId} (${series.provider})`);
	const refs = await scraper.fetchChapterList(series.tocUrl);
	return syncChapterList(seriesId, refs);
}
