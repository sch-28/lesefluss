import { log } from "../../utils/log";
import { queries } from "../db/queries";
import type { Series } from "../db/schema";
import { commitChapter, commitSeries, syncChapterList } from "./commit";
import { detectScraper, scrapersById } from "./registry";
import type { ChapterFetchResult } from "./types";

/**
 * Import a brand-new series. Sole caller of `commitSeries`.
 *
 * Throws:
 *   - `Error("NO_SCRAPER")` — the URL doesn't match any registered provider.
 */
export async function runSerialImport(url: string): Promise<Series> {
	const scraper = detectScraper(url);
	if (!scraper) throw new Error("NO_SCRAPER");

	log("serial-scrapers", `import via ${scraper.id}: ${url}`);
	const meta = await scraper.fetchSeriesMetadata(url);
	const chapters = await scraper.fetchChapterList(meta.tocUrl);
	if (chapters.length === 0) throw new Error("NO_CHAPTERS");
	return commitSeries(meta, chapters);
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
