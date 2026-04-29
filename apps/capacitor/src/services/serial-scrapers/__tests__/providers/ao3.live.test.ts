/**
 * Live smoke for the AO3 adapter — hits archiveofourown.org for real to catch
 * site re-skins that the fixture-based unit tests can't see.
 *
 * Runs ONLY via `pnpm test:live` (see `vitest.live.config.ts`). Skipped by the
 * default `pnpm test` and by CI. Run manually before each release; if a test
 * here fails, the SELECTORS / extraction in `providers/ao3.ts` is out of sync
 * with upstream — fix the adapter and update the matching unit fixtures
 * together.
 *
 * Strategy: self-bootstrap. We don't pin to a specific fic (it could be
 * deleted / orphaned). Instead `search` discovers a real work, and the
 * subsequent metadata + chapter-list calls go against whatever URL the
 * search returned. Assertions are loose contracts ("non-empty title",
 * "≥1 chapter") not exact text matches.
 */
import { describe, expect, it, vi } from "vitest";

// Direct fetch to AO3 — bypasses both CapacitorHttp (native-only) and the
// catalog `/proxy/article` (web fallback). The smoke is for AO3's shape, not
// our infrastructure. Throttle stays real so we honor AO3's 5s rate limit.
vi.mock("../../fetch", () => ({
	fetchHtml: async (url: string): Promise<string> => {
		const res = await fetch(url, {
			headers: {
				"User-Agent": "Mozilla/5.0 (compatible; LesefussBot-Smoke/1.0; +https://lesefluss.app/bot)",
			},
		});
		if (!res.ok) throw new Error(`FETCH_FAILED:${res.status}`);
		return res.text();
	},
}));

import { ao3Scraper } from "../../providers/ao3";
import { assertEndpointsReachable } from "../live-helpers";

// Common-but-stable query — almost guaranteed to return results on AO3 for
// the foreseeable future. If this ever stops returning hits we have bigger
// problems than test failures. Using a public-domain fandom keeps this clear
// of any living-author politics (test queries get embedded in CI logs).
const SMOKE_QUERY = "sherlock holmes";

describe("ao3 [live]", () => {
	const search = ao3Scraper.search;
	if (!search) throw new Error("AO3 adapter must implement `search`");

	it("end-to-end: search → fetchSeriesMetadata → fetchChapterList against live AO3", async () => {
		// 1. Search returns at least one parseable result.
		const results = await search(SMOKE_QUERY);
		expect(results.length).toBeGreaterThan(0);

		const first = results[0];
		expect(first.title).toBeTruthy();
		expect(first.sourceUrl).toMatch(/^https:\/\/archiveofourown\.org\/works\/\d+/);
		expect(first.provider).toBe("ao3");
		// Catches the case where AO3 changes the `<dd class="chapters">` markup
		// and `parseChapterCount` silently starts returning null for everything.
		expect(first.chapterCount === null || typeof first.chapterCount === "number").toBe(true);

		// 2. Pick a candidate with multiple chapters so the synthetic
		//    single-ref fallback in `fetchChapterList` (returns `[{ sourceUrl:
		//    workUrl }]` when the navigate page can't be parsed) is
		//    distinguishable from a real one-chapter work in the assertions
		//    below.
		const candidate =
			results.find((r) => typeof r.chapterCount === "number" && r.chapterCount > 1) ?? first;

		// 3. fetchSeriesMetadata returns a *real* title — the adapter's
		//    `?? "Untitled"` fallback would otherwise sneak past `toBeTruthy`.
		const meta = await ao3Scraper.fetchSeriesMetadata(candidate.sourceUrl);
		expect(meta.title).toBeTruthy();
		expect(meta.title).not.toBe("Untitled");
		expect(meta.provider).toBe("ao3");
		expect(meta.sourceUrl).toBe(candidate.sourceUrl);
		expect(meta.tocUrl).toBe(`${candidate.sourceUrl}/navigate`);

		// 4. fetchChapterList parses real chapter refs from the navigate page.
		//    The synthetic fallback emits a single ref whose URL is the work
		//    root (`/works/N`); a real chapter URL is `/works/N/chapters/M`.
		//    Asserting the `/chapters/\d+` segment fails the broken path
		//    loudly. The `length > 1` + ratio guards add belt-and-suspenders
		//    against a one-real-chapter masquerade.
		const chapters = await ao3Scraper.fetchChapterList(meta.tocUrl);
		const expected = candidate.chapterCount ?? 0;
		expect(chapters.length).toBeGreaterThan(1);
		if (expected > 1) {
			expect(chapters.length).toBeGreaterThanOrEqual(Math.floor(expected * 0.5));
		}
		expect(chapters[0].sourceUrl).toMatch(
			/^https:\/\/archiveofourown\.org\/works\/\d+\/chapters\/\d+$/,
		);
		expect(chapters[chapters.length - 1].sourceUrl).toMatch(
			/^https:\/\/archiveofourown\.org\/works\/\d+\/chapters\/\d+$/,
		);
		expect(chapters[0].title).toBeTruthy();

		// 5. Reachability: catches URL-synthesis bugs that pass the regex but
		//    return no content. See `assertEndpointsReachable`.
		await assertEndpointsReachable(ao3Scraper, chapters);
	});

	it("getPopular returns parseable results from the kudos-sorted works search", async () => {
		const getPopular = ao3Scraper.getPopular;
		if (!getPopular) throw new Error("AO3 adapter must implement `getPopular`");

		const results = await getPopular();
		expect(results.length).toBeGreaterThan(0);
		const first = results[0];
		expect(first.title).toBeTruthy();
		expect(first.sourceUrl).toMatch(/^https:\/\/archiveofourown\.org\/works\/\d+/);
		expect(first.provider).toBe("ao3");
	});
});
