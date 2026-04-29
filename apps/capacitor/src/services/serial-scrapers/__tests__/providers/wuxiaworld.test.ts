import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the network module before importing the adapter under test. Vitest
// hoists vi.mock to the top of the file, so the import below picks up the stub.
vi.mock("../../fetch", () => ({
	fetchHtml: vi.fn(),
}));

// Throttle is correctness-tested in its own file; here we make it a no-op so
// WW tests don't sit through the real 2-second gate between calls.
vi.mock("../../utils/throttle", () => ({
	throttle: vi.fn().mockResolvedValue(undefined),
	platformThrottleMs: (native: number, _catalog: number) => native,
}));

import { fetchHtml } from "../../fetch";
import { wuxiaworldScraper } from "../../providers/wuxiaworld";

const FIXTURES_DIR = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../fixtures/wuxiaworld",
);

function loadFixture(name: string, ext: "html" | "json" = "html"): string {
	return readFileSync(path.join(FIXTURES_DIR, `${name}.${ext}`), "utf8");
}

const mockedFetchHtml = vi.mocked(fetchHtml);

beforeEach(() => {
	mockedFetchHtml.mockReset();
});

// ─── canHandle ──────────────────────────────────────────────────────────────

describe("wuxiaworld.canHandle", () => {
	it.each([
		"https://www.wuxiaworld.com/novel/martial-world",
		"https://wuxiaworld.com/novel/martial-world",
		"https://www.wuxiaworld.com/novel/martial-world/mw-chapter-1",
		"https://www.wuxiaworld.com/novel/martial-world/chapters",
		"https://www.wuxiaworld.com/novel/a-novel-with-a-long-slug",
	])("accepts %s", (url) => {
		expect(wuxiaworldScraper.canHandle(url)).toBe(true);
	});

	it.each([
		"https://www.wuxiaworld.com/novels/trending",
		"https://www.wuxiaworld.com/profile/user123",
		"https://www.wuxiaworld.com/",
		"https://archiveofourown.org/novel/123",
		"not-a-url",
	])("rejects %s", (url) => {
		expect(wuxiaworldScraper.canHandle(url)).toBe(false);
	});
});

// ─── fetchSeriesMetadata ────────────────────────────────────────────────────

describe("wuxiaworld.fetchSeriesMetadata", () => {
	it("extracts title, author, cover, description from React Query state; sourceUrl=novel root, tocUrl=/chapters", async () => {
		mockedFetchHtml.mockResolvedValue(loadFixture("novel"));

		const meta = await wuxiaworldScraper.fetchSeriesMetadata(
			"https://www.wuxiaworld.com/novel/a-test-novel",
		);

		expect(meta).toEqual({
			title: "A Test Novel",
			author: "testauthor",
			coverImage: "https://cdn.wuxiaworld.com/covers/a-test-novel.jpg",
			// `synopsis.value` is HTML in the JSON blob; stripTags removes the <p>.
			description: "A short description of the test novel.",
			// Novel root is the user-visible link (browser-friendly); `/chapters`
			// is the internal scraping endpoint where the React Query state lives.
			sourceUrl: "https://www.wuxiaworld.com/novel/a-test-novel",
			tocUrl: "https://www.wuxiaworld.com/novel/a-test-novel/chapters",
			provider: "wuxiaworld",
		});
	});

	it("normalizes a chapter URL to the novel root", async () => {
		mockedFetchHtml.mockResolvedValue(loadFixture("novel"));

		const meta = await wuxiaworldScraper.fetchSeriesMetadata(
			"https://www.wuxiaworld.com/novel/a-test-novel/atn-chapter-1",
		);

		expect(meta.sourceUrl).toBe("https://www.wuxiaworld.com/novel/a-test-novel");
		// We still scrape the `/chapters` subpage for the embedded React Query
		// state — the user-facing `sourceUrl` and the internal scrape target
		// diverge on purpose.
		expect(mockedFetchHtml).toHaveBeenCalledWith(
			"https://www.wuxiaworld.com/novel/a-test-novel/chapters",
		);
	});

	it("throws WUXIAWORLD_URL_NOT_A_NOVEL for a non-novel URL", async () => {
		await expect(
			wuxiaworldScraper.fetchSeriesMetadata("https://www.wuxiaworld.com/profile/user123"),
		).rejects.toThrow("WUXIAWORLD_URL_NOT_A_NOVEL");
	});
});

// ─── fetchChapterList ───────────────────────────────────────────────────────

describe("wuxiaworld.fetchChapterList", () => {
	it("synthesizes refs from chapterGroups ranges using the firstChapter slug prefix", async () => {
		mockedFetchHtml.mockResolvedValue(loadFixture("novel"));

		// Group 1 covers units 1..2, group 2 covers unit 3 — synthesis enumerates
		// integers across the union and builds slugs as `{prefix}{N}` using the
		// `atn-chapter-` prefix derived from `firstChapter.slug`.
		const refs = await wuxiaworldScraper.fetchChapterList(
			"https://www.wuxiaworld.com/novel/a-test-novel/chapters",
		);

		expect(refs).toEqual([
			{
				index: 0,
				title: "Chapter 1",
				sourceUrl: "https://www.wuxiaworld.com/novel/a-test-novel/atn-chapter-1",
			},
			{
				index: 1,
				title: "Chapter 2",
				sourceUrl: "https://www.wuxiaworld.com/novel/a-test-novel/atn-chapter-2",
			},
			{
				index: 2,
				title: "Chapter 3",
				sourceUrl: "https://www.wuxiaworld.com/novel/a-test-novel/atn-chapter-3",
			},
		]);
	});

	it("uses firstChapter.slug verbatim when its suffix doesn't match its unit number", async () => {
		// Real-world case: "The Last Place Hero's Return" lists chapter 1 with
		// slug `tlphr-chapter-0` (units=1) while later chapters align (units=2 →
		// `tlphr-chapter-2`). Synthesizing `prefix + units` would 404 chapter 1.
		const reactState = {
			queries: [
				{
					queryKey: ["novel", "off-by-one"],
					state: {
						data: {
							item: {
								name: "Off By One",
								slug: "off-by-one",
								chapterInfo: {
									firstChapter: { slug: "obo-chapter-0", number: { units: 1 } },
									latestChapter: { slug: "obo-chapter-3", number: { units: 3 } },
									chapterGroups: [
										{
											fromChapterNumber: { units: 0 },
											toChapterNumber: { units: 9999 },
										},
									],
								},
							},
						},
					},
				},
			],
		};
		const html = `<html><body><script>window.__REACT_QUERY_STATE__ = ${JSON.stringify(reactState)};</script></body></html>`;
		mockedFetchHtml.mockResolvedValue(html);

		const refs = await wuxiaworldScraper.fetchChapterList(
			"https://www.wuxiaworld.com/novel/off-by-one/chapters",
		);

		expect(refs).toEqual([
			{
				index: 0,
				title: "Chapter 1",
				sourceUrl: "https://www.wuxiaworld.com/novel/off-by-one/obo-chapter-0",
			},
			{
				index: 1,
				title: "Chapter 2",
				sourceUrl: "https://www.wuxiaworld.com/novel/off-by-one/obo-chapter-2",
			},
			{
				index: 2,
				title: "Chapter 3",
				sourceUrl: "https://www.wuxiaworld.com/novel/off-by-one/obo-chapter-3",
			},
		]);
	});

	it("returns one synthetic ref when chapterGroups is empty", async () => {
		mockedFetchHtml.mockResolvedValue(loadFixture("novel-empty-toc"));

		const tocUrl = "https://www.wuxiaworld.com/novel/an-empty-novel";
		const refs = await wuxiaworldScraper.fetchChapterList(tocUrl);

		expect(refs).toEqual([{ index: 0, title: "Chapter 1", sourceUrl: tocUrl }]);
	});
});

// ─── fetchChapterContent ────────────────────────────────────────────────────

describe("wuxiaworld.fetchChapterContent", () => {
	const ref = {
		index: 0,
		title: "Chapter 1",
		sourceUrl: "https://www.wuxiaworld.com/novel/a-test-novel/atn-chapter-1",
	};

	it("extracts visible paragraphs from the JSON content blob", async () => {
		mockedFetchHtml.mockResolvedValue(loadFixture("chapter"));

		const result = await wuxiaworldScraper.fetchChapterContent(ref);

		if (result.status !== "fetched") throw new Error(`expected fetched, got ${result.status}`);
		expect(result.content).toContain("first paragraph of the chapter");
		expect(result.content).toContain("second visible paragraph");
	});

	it("strips inline display:none paragraphs (defensive parity)", async () => {
		mockedFetchHtml.mockResolvedValue(loadFixture("chapter"));

		const result = await wuxiaworldScraper.fetchChapterContent(ref);
		if (result.status !== "fetched") throw new Error("expected fetched");

		expect(result.content).not.toContain("A hidden paragraph that should not appear");
	});

	it("returns { status: 'locked' } when karmaInfo.isKarmaRequired is true", async () => {
		mockedFetchHtml.mockResolvedValue(loadFixture("chapter-locked"));

		const result = await wuxiaworldScraper.fetchChapterContent(ref);

		// The locked path is the primary purpose of this adapter. The reader
		// renders <ChapterStateOverlay status="locked" /> and does NOT show a
		// retry button — locked is terminal, not transient.
		expect(result).toEqual({ status: "locked" });
	});

	it("returns CONTENT_NOT_FOUND when neither JSON content nor div.chapter-content exists", async () => {
		mockedFetchHtml.mockResolvedValue(loadFixture("chapter-empty"));

		const result = await wuxiaworldScraper.fetchChapterContent(ref);
		expect(result).toEqual({ status: "error", reason: "CONTENT_NOT_FOUND" });
	});

	it("returns error (not throw) when fetchHtml rejects", async () => {
		mockedFetchHtml.mockRejectedValue(new Error("FETCH_FAILED:503"));

		const result = await wuxiaworldScraper.fetchChapterContent(ref);
		expect(result).toEqual({ status: "error", reason: "FETCH_FAILED:503" });
	});

	it("never returns 'locked' for a normal free chapter", async () => {
		mockedFetchHtml.mockResolvedValue(loadFixture("chapter"));
		const result = await wuxiaworldScraper.fetchChapterContent(ref);
		expect(result.status).not.toBe("locked");
	});
});

// ─── search ─────────────────────────────────────────────────────────────────

describe("wuxiaworld.search", () => {
	// Narrow once so the rest of the suite uses `search(...)`.
	const search = wuxiaworldScraper.search;
	if (!search) throw new Error("Wuxiaworld adapter must implement `search`");

	it("parses JSON search results, strips synopsis HTML, tags provider; author always null", async () => {
		mockedFetchHtml.mockResolvedValue(loadFixture("search-results", "json"));

		const results = await search("martial");

		expect(results).toHaveLength(2);

		expect(results[0]).toEqual({
			title: "Martial World",
			author: null,
			description:
				"Lin Ming, a talented man for martial arts wanted to reach the pinnacle of martial arts.",
			coverImage: "https://cdn.wuxiaworld.com/covers/martial-world.jpg",
			chapterCount: 2200,
			sourceUrl: "https://www.wuxiaworld.com/novel/martial-world",
			provider: "wuxiaworld",
		});

		expect(results[1]).toEqual({
			title: "True Martial World",
			author: null,
			description: "With the Kingdom's fall, a young man's journey of cultivation begins.",
			coverImage: null,
			chapterCount: 1600,
			sourceUrl: "https://www.wuxiaworld.com/novel/true-martial-world",
			provider: "wuxiaworld",
		});
	});

	it("URL-encodes the query and uses the /api/novels/search endpoint", async () => {
		mockedFetchHtml.mockResolvedValue(loadFixture("search-results", "json"));

		await search("hello & world");

		expect(mockedFetchHtml).toHaveBeenCalledWith(
			"https://www.wuxiaworld.com/api/novels/search?query=hello%20%26%20world",
		);
	});

	it("returns [] when no results match", async () => {
		mockedFetchHtml.mockResolvedValue(loadFixture("search-empty", "json"));

		const results = await search("xyzzy-no-match");
		expect(results).toEqual([]);
	});
});

describe("wuxiaworld.getPopular", () => {
	const getPopular = wuxiaworldScraper.getPopular;
	if (!getPopular) throw new Error("Wuxiaworld adapter must implement `getPopular`");

	it("scrapes /novels SSR state, sorts by trendingScore desc, maps to SearchResult", async () => {
		mockedFetchHtml.mockResolvedValue(loadFixture("novels-listing"));

		const results = await getPopular();

		expect(mockedFetchHtml).toHaveBeenCalledWith("https://www.wuxiaworld.com/novels");

		// Bravo (200) > Charlie (100) > Alpha (50) by trendingScore.
		expect(results.map((r) => r.title)).toEqual(["Bravo Title", "Charlie Title", "Alpha Title"]);

		expect(results[0]).toEqual({
			title: "Bravo Title",
			author: "Bravo Author",
			description: "Bravo synopsis.",
			coverImage: "https://cdn.wuxiaworld.com/covers/bravo.webp",
			chapterCount: 456,
			sourceUrl: "https://www.wuxiaworld.com/novel/bravo-title",
			provider: "wuxiaworld",
		});

		// Charlie has null cover/author/chapterCount — verify the nested-value
		// guards handle missing data without throwing.
		expect(results[1]).toMatchObject({
			title: "Charlie Title",
			author: null,
			coverImage: null,
			chapterCount: null,
		});
	});
});
