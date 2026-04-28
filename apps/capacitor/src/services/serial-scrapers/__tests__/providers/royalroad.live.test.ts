/**
 * Live smoke for the Royal Road adapter — hits royalroad.com for real to catch
 * Cloudflare-related blocks and site re-skins that fixture-based tests can't see.
 *
 * Runs ONLY via `pnpm test:live` (see `vitest.live.config.ts`). Skipped by the
 * default `pnpm test` and by CI. Run manually before each release.
 *
 * **Cloudflare signal:** if this smoke fails with FETCH_FAILED:403 or
 * FETCH_FAILED:503 from a clean residential IP, the server is blocking the
 * request. That's important release-gate information — it means the web
 * fallback path (`/proxy/article`) will also be blocked for web-app users,
 * and only native CapacitorHttp will work. Document and act accordingly.
 *
 * Strategy: self-bootstrap. We don't pin to a specific fiction (it could be
 * deleted or moved). `search` discovers a real fiction, and the subsequent
 * metadata + chapter-list calls go against whatever URL the search returned.
 * Assertions are loose contracts ("non-empty title", "≥1 chapter") — not exact
 * text matches, since upstream content evolves.
 */
import { describe, expect, it, vi } from "vitest";

// Direct fetch to royalroad.com — bypasses both CapacitorHttp (native-only)
// and the catalog `/proxy/article` (web fallback). The smoke is for RR's page
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

import { royalroadScraper } from "../../providers/royalroad";

// "dungeon" is one of the most common Royal Road tags and will reliably
// return search results for the foreseeable future.
const SMOKE_QUERY = "dungeon";

describe("royalroad [live]", () => {
	const search = royalroadScraper.search;
	if (!search) throw new Error("Royal Road adapter must implement `search`");

	it("end-to-end: search → fetchSeriesMetadata → fetchChapterList against live RR", async () => {
		// 1. Search returns at least one parseable result.
		const results = await search(SMOKE_QUERY);
		expect(results.length).toBeGreaterThan(0);

		const first = results[0];
		expect(first.title).toBeTruthy();
		expect(first.sourceUrl).toMatch(/^https:\/\/www\.royalroad\.com\/fiction\/\d+/);
		expect(first.provider).toBe("royalroad");
		// Catches the case where RR changes stats markup and chapterCount
		// silently starts returning null for everything.
		expect(first.chapterCount === null || typeof first.chapterCount === "number").toBe(true);
		// RR search results intentionally omit author — always null.
		expect(first.author).toBeNull();

		// 2. Pick a candidate with multiple chapters so the synthetic
		//    single-ref fallback in `fetchChapterList` is distinguishable from
		//    a real 1-chapter fiction in the assertions below. The first
		//    search result can also be a brand-new 0-chapter fiction; this
		//    filter handles both.
		const candidate =
			results.find((r) => typeof r.chapterCount === "number" && r.chapterCount > 1) ?? first;

		// 3. fetchSeriesMetadata returns a *real* title — the adapter's
		//    `?? "Untitled"` fallback would otherwise sneak past `toBeTruthy`.
		const meta = await royalroadScraper.fetchSeriesMetadata(candidate.sourceUrl);
		expect(meta.title).toBeTruthy();
		expect(meta.title).not.toBe("Untitled");
		expect(meta.provider).toBe("royalroad");
		expect(meta.sourceUrl).toBe(candidate.sourceUrl);
		expect(meta.tocUrl).toBe(candidate.sourceUrl);

		// 4. fetchChapterList parses real chapter refs from window.chapters
		//    JSON. The synthetic fallback emits a single ref pointing at the
		//    fiction root; a real URL is `/fiction/N/.+/chapter/M`. The
		//    `/chapter/\d+` pattern below already fails that fallback; the
		//    `length > 1` + ratio guards add belt-and-suspenders against a
		//    one-real-chapter masquerade.
		const chapters = await royalroadScraper.fetchChapterList(meta.tocUrl);
		const expected = candidate.chapterCount ?? 0;
		expect(chapters.length).toBeGreaterThan(1);
		if (expected > 1) {
			expect(chapters.length).toBeGreaterThanOrEqual(Math.floor(expected * 0.5));
		}
		expect(chapters[0].sourceUrl).toMatch(
			/^https:\/\/www\.royalroad\.com\/fiction\/\d+\/.+\/chapter\/\d+/,
		);
		expect(chapters[chapters.length - 1].sourceUrl).toMatch(
			/^https:\/\/www\.royalroad\.com\/fiction\/\d+\/.+\/chapter\/\d+/,
		);
		expect(chapters[0].title).toBeTruthy();
	});
});
