/**
 * Live smoke for the Wuxiaworld adapter — hits wuxiaworld.com for real to catch
 * site re-skins and React-Query-state shape changes that fixture-based tests
 * can't see.
 *
 * Runs ONLY via `pnpm test:live` (see `vitest.live.config.ts`). Skipped by the
 * default `pnpm test` and by CI. Run manually before each release.
 *
 * Strategy: self-bootstrap. Search a reliable query, take the first result,
 * run fetchSeriesMetadata + fetchChapterList against it. Assertions are
 * deliberately strict — strict enough to fail loudly on the *silent fallback*
 * patterns that snuck through last time (`title === "Untitled"`, single
 * synthetic chapter when the real list failed to parse).
 *
 * **Paywall note:** this smoke does not call fetchChapterContent on a known
 * paid chapter, so karma-lock behaviour is covered by unit fixtures only.
 */
import { describe, expect, it, vi } from "vitest";

// Direct fetch to wuxiaworld.com — bypasses both CapacitorHttp (native-only)
// and the catalog `/proxy/article` (web fallback). The smoke is for WW's page
// shape, not our infrastructure. Throttle stays real to honor the 2s pace.
vi.mock("../../fetch", () => ({
	fetchHtml: async (url: string): Promise<string> => {
		const res = await fetch(url, {
			headers: { "User-Agent": "Mozilla/5.0 (LeseflussLiveSmoke/1.0)" },
		});
		if (!res.ok) throw new Error(`FETCH_FAILED:${res.status}`);
		return res.text();
	},
}));

import { wuxiaworldScraper } from "../../providers/wuxiaworld";

// "martial" is one of the most common WW tags and reliably returns results
// for the foreseeable future.
const SMOKE_QUERY = "martial";

describe("wuxiaworld [live]", () => {
	const search = wuxiaworldScraper.search;
	if (!search) throw new Error("Wuxiaworld adapter must implement `search`");

	it("end-to-end: search → fetchSeriesMetadata → fetchChapterList against live WW", async () => {
		// 1. Search returns at least one parseable result with a real chapterCount.
		const results = await search(SMOKE_QUERY);
		expect(results.length).toBeGreaterThan(0);

		const candidate =
			results.find((r) => typeof r.chapterCount === "number" && r.chapterCount >= 50) ??
			results[0];
		expect(candidate.title).toBeTruthy();
		expect(candidate.sourceUrl).toMatch(/^https:\/\/www\.wuxiaworld\.com\/novel\//);
		expect(candidate.provider).toBe("wuxiaworld");

		// 2. fetchSeriesMetadata returns a *real* title and author — the broken
		// fallback path returned `title === "Untitled"` + `author === null`,
		// which the previous live smoke failed to catch.
		const meta = await wuxiaworldScraper.fetchSeriesMetadata(candidate.sourceUrl);
		expect(meta.title).toBeTruthy();
		expect(meta.title).not.toBe("Untitled");
		expect(meta.author).toBeTruthy();
		expect(typeof meta.author).toBe("string");
		expect(meta.provider).toBe("wuxiaworld");
		expect(meta.tocUrl).toBe(meta.sourceUrl);
		expect(meta.coverImage).toMatch(/^https?:\/\//);

		// 3. fetchChapterList synthesizes refs from chapterGroups. We assert a
		// generous **lower** bound on length (≥ 50 % of the search-reported
		// chapterCount) to catch the real regression — the silent
		// empty-toc fallback that returned a single synthetic ref. We
		// deliberately do NOT cap the upper bound: WW's search-API
		// `chapterCount` underreports the SSR group ranges (it appears to
		// exclude paid/VIP chapters), so the synthesizer routinely produces
		// 2 × the search count for popular novels. That over-count is fine.
		const chapters = await wuxiaworldScraper.fetchChapterList(meta.tocUrl);
		const expected = candidate.chapterCount ?? 0;
		expect(chapters.length).toBeGreaterThan(1);
		if (expected > 0) {
			expect(chapters.length).toBeGreaterThanOrEqual(Math.floor(expected * 0.5));
		}

		// Every URL should follow the synthesized `/novel/{slug}/{prefix}-N`
		// pattern derived from `firstChapter.slug`. A drift here means our
		// slug-prefix regex is off.
		const slugMatch = candidate.sourceUrl.match(/\/novel\/([^/]+)/);
		const novelSlug = slugMatch?.[1];
		expect(novelSlug).toBeTruthy();
		const urlRe = new RegExp(`^https://www\\.wuxiaworld\\.com/novel/${novelSlug}/[a-z0-9-]+-\\d+$`);
		expect(chapters[0].sourceUrl).toMatch(urlRe);
		expect(chapters[chapters.length - 1].sourceUrl).toMatch(urlRe);
	});
});
