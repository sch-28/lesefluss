import { expect } from "vitest";
import type { ChapterRef, SerialScraper } from "../types";

/**
 * Reachability check used by every provider's live smoke. Fetches the first
 * and last synthesized chapter for real and asserts the URL resolved — i.e.
 * status is `fetched` (got content) or `locked` (paywalled but URL OK).
 *
 * Catches URL-synthesis bugs that produce well-formed-but-broken URLs which
 * regex shape checks would happily accept (e.g. an off-by-one slug suffix).
 *
 * Failure messages include the URL and the full result object so the cause
 * is visible without re-running with extra logging.
 */
export async function assertEndpointsReachable(
	scraper: SerialScraper,
	chapters: ChapterRef[],
): Promise<void> {
	const first = chapters[0];
	const last = chapters[chapters.length - 1];

	const firstResult = await scraper.fetchChapterContent(first);
	expect(
		["fetched", "locked"],
		`first chapter ${first.sourceUrl} → ${JSON.stringify(firstResult)}`,
	).toContain(firstResult.status);

	const lastResult = await scraper.fetchChapterContent(last);
	expect(
		["fetched", "locked"],
		`last chapter ${last.sourceUrl} → ${JSON.stringify(lastResult)}`,
	).toContain(lastResult.status);
}
