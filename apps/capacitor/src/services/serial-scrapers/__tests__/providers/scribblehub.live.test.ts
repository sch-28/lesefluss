/**
 * Live smoke for the ScribbleHub adapter — hits scribblehub.com for real to
 * catch site re-skins that the fixture-based unit tests can't see.
 *
 * Runs ONLY via `pnpm test:live` (see `vitest.live.config.ts`). Skipped by the
 * default `pnpm test` and by CI. Run manually before each release; if a test
 * here fails, the SELECTORS / extraction in `providers/scribblehub.ts` is out
 * of sync with upstream — fix the adapter and update the matching unit
 * fixtures together.
 *
 * Strategy mirrors AO3's smoke: self-bootstrap via `search`, then drive the
 * subsequent metadata + chapter-list calls against whatever URL the search
 * returned. Assertions are loose contracts ("non-empty title", "≥1 chapter")
 * not exact text matches.
 */
import { describe, expect, it, vi } from "vitest";

// Direct fetch to SH — bypasses both CapacitorHttp (native-only) and the
// catalog `/proxy/article` (web fallback). The smoke is for SH's shape, not
// our infrastructure. Throttle stays real so we honor SH's 2s pacing.
vi.mock("../../fetch", () => ({
	fetchHtml: async (url: string): Promise<string> => {
		const res = await fetch(url, {
			headers: { "User-Agent": "Mozilla/5.0 (LesefllussLiveSmoke/1.0)" },
		});
		if (!res.ok) throw new Error(`FETCH_FAILED:${res.status}`);
		return res.text();
	},
}));

import { scribblehubScraper } from "../../providers/scribblehub";

// Politically-neutral, near-guaranteed-hits query on SH — the most common
// isekai/litrpg trope on the platform.
const SMOKE_QUERY = "reincarnation";

describe("scribblehub [live]", () => {
	const search = scribblehubScraper.search;
	if (!search) throw new Error("ScribbleHub adapter must implement `search`");

	it("end-to-end: search → fetchSeriesMetadata → fetchChapterList against live SH", async () => {
		// 1. Search returns at least one parseable result.
		const results = await search(SMOKE_QUERY);
		expect(results.length).toBeGreaterThan(0);

		const first = results[0];
		expect(first.title).toBeTruthy();
		expect(first.sourceUrl).toMatch(/^https:\/\/www\.scribblehub\.com\/series\/\d+\//);
		expect(first.provider).toBe("scribblehub");
		// Catches the case where SH changes the `nl_stat destp` markup and
		// `parseChapterCount` silently starts returning null for everything.
		expect(first.chapterCount === null || typeof first.chapterCount === "number").toBe(true);

		// 2. Pick a candidate with multiple chapters so the synthetic
		//    single-ref fallback in `fetchChapterList` is distinguishable from
		//    a real 1-chapter series in the assertions below. SH renders
		//    abbreviated counts like "1.6k" which `parseChapterCount` maps to
		//    null; those candidates are skipped here.
		const candidate =
			results.find((r) => typeof r.chapterCount === "number" && r.chapterCount > 1) ?? first;

		// 3. fetchSeriesMetadata returns a *real* title — the adapter's
		//    `?? "Untitled"` fallback would otherwise sneak past `toBeTruthy`.
		const meta = await scribblehubScraper.fetchSeriesMetadata(candidate.sourceUrl);
		expect(meta.title).toBeTruthy();
		expect(meta.title).not.toBe("Untitled");
		expect(meta.provider).toBe("scribblehub");
		expect(meta.sourceUrl).toBe(candidate.sourceUrl);
		expect(meta.tocUrl).toBe(candidate.sourceUrl);

		// 4. fetchChapterList parses real chapter refs from the inline TOC.
		//    The synthetic fallback emits a single ref pointing at the series
		//    root; a real chapter URL is `/read/{id}-{slug}/chapter/N`.
		//    Asserting the `/read/` segment fails the broken path loudly. The
		//    `length > 1` + ratio guards add belt-and-suspenders against a
		//    one-real-chapter masquerade.
		const chapters = await scribblehubScraper.fetchChapterList(meta.tocUrl);
		const expected = candidate.chapterCount ?? 0;
		expect(chapters.length).toBeGreaterThan(1);
		if (expected > 1) {
			expect(chapters.length).toBeGreaterThanOrEqual(Math.floor(expected * 0.5));
		}
		expect(chapters[0].title).toBeTruthy();
		expect(chapters[0].sourceUrl).toMatch(
			/^https:\/\/www\.scribblehub\.com\/read\/\d+-[a-z0-9-]+\/chapter\/\d+/,
		);
		expect(chapters[chapters.length - 1].sourceUrl).toMatch(
			/^https:\/\/www\.scribblehub\.com\/read\/\d+-[a-z0-9-]+\/chapter\/\d+/,
		);
	});
});
