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
// RR tests don't sit through the real 2-second gate between calls.
vi.mock("../../utils/throttle", () => ({
	throttle: vi.fn().mockResolvedValue(undefined),
	platformThrottleMs: (native: number, _catalog: number) => native,
}));

import { fetchHtml } from "../../fetch";
import { royalroadScraper } from "../../providers/royalroad";

const FIXTURES_DIR = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../fixtures/royalroad",
);

function loadFixture(name: string): string {
	return readFileSync(path.join(FIXTURES_DIR, `${name}.html`), "utf8");
}

const mockedFetchHtml = vi.mocked(fetchHtml);

beforeEach(() => {
	mockedFetchHtml.mockReset();
});

// ─── canHandle ──────────────────────────────────────────────────────────────

describe("royalroad.canHandle", () => {
	it.each([
		"https://www.royalroad.com/fiction/21220/mother-of-learning",
		"https://royalroad.com/fiction/21220/mother-of-learning",
		"https://www.royalroad.com/fiction/21220/mother-of-learning/chapter/301778/1-good-morning-brother",
		"https://www.royalroad.com/fiction/21220",
	])("accepts %s", (url) => {
		expect(royalroadScraper.canHandle(url)).toBe(true);
	});

	it.each([
		"https://www.royalroad.com/fictions/best-rated",
		"https://www.royalroad.com/profile/100374",
		"https://www.royalroad.com/",
		"https://archiveofourown.org/fiction/21220",
		"not-a-url",
	])("rejects %s", (url) => {
		expect(royalroadScraper.canHandle(url)).toBe(false);
	});
});

// ─── fetchSeriesMetadata ────────────────────────────────────────────────────

describe("royalroad.fetchSeriesMetadata", () => {
	it("extracts title, author, cover, description; tocUrl === sourceUrl", async () => {
		mockedFetchHtml.mockResolvedValue(loadFixture("fiction"));

		const meta = await royalroadScraper.fetchSeriesMetadata(
			"https://www.royalroad.com/fiction/99999/a-test-fiction",
		);

		expect(meta).toEqual({
			title: "A Test Fiction",
			author: "testauthor",
			coverImage: "https://www.royalroadcdn.com/public/covers-full/99999-a-test-fiction.jpg",
			description: "A short description of the test fiction.",
			sourceUrl: "https://www.royalroad.com/fiction/99999/a-test-fiction",
			tocUrl: "https://www.royalroad.com/fiction/99999/a-test-fiction",
			provider: "royalroad",
		});
	});

	it("normalizes a chapter URL to the fiction root", async () => {
		mockedFetchHtml.mockResolvedValue(loadFixture("fiction"));

		const meta = await royalroadScraper.fetchSeriesMetadata(
			"https://www.royalroad.com/fiction/99999/a-test-fiction/chapter/1001/1-chapter-one",
		);

		expect(meta.sourceUrl).toBe("https://www.royalroad.com/fiction/99999/a-test-fiction");
		expect(mockedFetchHtml).toHaveBeenCalledWith(
			"https://www.royalroad.com/fiction/99999/a-test-fiction",
		);
	});

	it("throws ROYALROAD_URL_NOT_A_FICTION for a non-fiction URL", async () => {
		await expect(
			royalroadScraper.fetchSeriesMetadata("https://www.royalroad.com/profile/100374"),
		).rejects.toThrow("ROYALROAD_URL_NOT_A_FICTION");
	});
});

// ─── fetchChapterList ───────────────────────────────────────────────────────

describe("royalroad.fetchChapterList", () => {
	it("parses window.chapters JSON and returns ChapterRef array", async () => {
		mockedFetchHtml.mockResolvedValue(loadFixture("fiction"));

		const refs = await royalroadScraper.fetchChapterList(
			"https://www.royalroad.com/fiction/99999/a-test-fiction",
		);

		expect(refs).toEqual([
			{
				index: 0,
				title: "1. Chapter One",
				sourceUrl:
					"https://www.royalroad.com/fiction/99999/a-test-fiction/chapter/1001/1-chapter-one",
			},
			{
				index: 1,
				title: "2. Chapter Two",
				sourceUrl:
					"https://www.royalroad.com/fiction/99999/a-test-fiction/chapter/1002/2-chapter-two",
			},
			{
				index: 2,
				title: "3. Chapter Three",
				sourceUrl:
					"https://www.royalroad.com/fiction/99999/a-test-fiction/chapter/1003/3-chapter-three",
			},
		]);
	});

	it("returns one synthetic ref for an empty window.chapters array (draft fiction)", async () => {
		mockedFetchHtml.mockResolvedValue(loadFixture("fiction-empty-chapters"));

		const tocUrl = "https://www.royalroad.com/fiction/99999/a-draft-fiction";
		const refs = await royalroadScraper.fetchChapterList(tocUrl);

		expect(refs).toEqual([{ index: 0, title: "Chapter 1", sourceUrl: tocUrl }]);
	});

	it("throws ROYALROAD_CHAPTERS_NOT_FOUND when window.chapters is absent", async () => {
		// chapter-empty.html has no window.chapters script block.
		mockedFetchHtml.mockResolvedValue(loadFixture("chapter-empty"));

		await expect(
			royalroadScraper.fetchChapterList("https://www.royalroad.com/fiction/99999/a-test-fiction"),
		).rejects.toThrow("ROYALROAD_CHAPTERS_NOT_FOUND");
	});
});

// ─── fetchChapterContent ────────────────────────────────────────────────────

describe("royalroad.fetchChapterContent", () => {
	const ref = {
		index: 0,
		title: "1. Chapter One",
		sourceUrl: "https://www.royalroad.com/fiction/99999/a-test-fiction/chapter/1001/1-chapter-one",
	};

	it("fetches and extracts visible paragraphs", async () => {
		mockedFetchHtml.mockResolvedValue(loadFixture("chapter"));

		const result = await royalroadScraper.fetchChapterContent(ref);

		expect(result.status).toBe("fetched");
		if (result.status !== "fetched") return; // narrow for TS
		expect(result.content).toContain("first paragraph of the chapter");
		expect(result.content).toContain("second visible paragraph");
	});

	it("strips RR head-style random-class anti-piracy spans", async () => {
		mockedFetchHtml.mockResolvedValue(loadFixture("chapter"));

		const result = await royalroadScraper.fetchChapterContent(ref);
		if (result.status !== "fetched") throw new Error("expected fetched");

		// The span with class `cAbCdEfGhIjKl` (declared display:none in <head>)
		// must be removed — it is NOT stripped by the existing inline-style path.
		expect(result.content).not.toContain("Unauthorized reproduction");
	});

	it("strips inline display:none paragraphs (defensive parity)", async () => {
		mockedFetchHtml.mockResolvedValue(loadFixture("chapter"));

		const result = await royalroadScraper.fetchChapterContent(ref);
		if (result.status !== "fetched") throw new Error("expected fetched");

		expect(result.content).not.toContain("Another hidden paragraph");
	});

	it("returns CONTENT_NOT_FOUND when div.chapter-inner.chapter-content is absent", async () => {
		mockedFetchHtml.mockResolvedValue(loadFixture("chapter-empty"));

		const result = await royalroadScraper.fetchChapterContent(ref);
		expect(result).toEqual({ status: "error", reason: "CONTENT_NOT_FOUND" });
	});

	it("returns error (not throw) when fetchHtml rejects", async () => {
		mockedFetchHtml.mockRejectedValue(new Error("FETCH_FAILED:503"));

		const result = await royalroadScraper.fetchChapterContent(ref);
		expect(result).toEqual({ status: "error", reason: "FETCH_FAILED:503" });
	});

	it("never returns 'locked' — RR has no paywall adapter, only fetched/error", async () => {
		mockedFetchHtml.mockResolvedValue(loadFixture("chapter"));
		const result = await royalroadScraper.fetchChapterContent(ref);
		expect(result.status).not.toBe("locked");
	});
});

// ─── search ─────────────────────────────────────────────────────────────────

describe("royalroad.search", () => {
	// Narrow once so the rest of the suite uses `search(...)` not `royalroadScraper.search!(...)`.
	const search = royalroadScraper.search;
	if (!search) throw new Error("Royal Road adapter must implement `search`");

	it("parses search results, absolutizes URLs, tags provider, extracts chapter count; author always null", async () => {
		mockedFetchHtml.mockResolvedValue(loadFixture("search-results"));

		const results = await search("test query");

		expect(results).toHaveLength(2);

		expect(results[0]).toEqual({
			title: "First Fiction",
			author: null,
			description: "A summary of the first fiction.",
			coverImage: "https://www.royalroadcdn.com/public/covers-full/99999-first-fiction.jpg",
			chapterCount: 42,
			sourceUrl: "https://www.royalroad.com/fiction/99999/first-fiction",
			provider: "royalroad",
		});

		// Second result: no cover img → null, abbreviated "1.6k Chapters" → null count.
		expect(results[1]).toEqual({
			title: "Second Fiction",
			author: null,
			description: "A no-cover abbreviated-chapter-count entry.",
			coverImage: null,
			chapterCount: null,
			sourceUrl: "https://www.royalroad.com/fiction/11111/second-fiction",
			provider: "royalroad",
		});
	});

	it("URL-encodes the query and uses the ?title= search endpoint", async () => {
		mockedFetchHtml.mockResolvedValue(loadFixture("search-empty"));

		await search("hello & world");

		expect(mockedFetchHtml).toHaveBeenCalledWith(
			"https://www.royalroad.com/fictions/search?title=hello%20%26%20world",
		);
	});

	it("returns [] when no results match", async () => {
		mockedFetchHtml.mockResolvedValue(loadFixture("search-empty"));

		const results = await search("zzzz");
		expect(results).toEqual([]);
	});
});

describe("royalroad.getPopular", () => {
	const getPopular = royalroadScraper.getPopular;
	if (!getPopular) throw new Error("Royal Road adapter must implement `getPopular`");

	it("hits the weekly-popular endpoint and parses the same fiction-list markup", async () => {
		mockedFetchHtml.mockResolvedValue(loadFixture("search-results"));

		const results = await getPopular();

		expect(mockedFetchHtml).toHaveBeenCalledWith(
			"https://www.royalroad.com/fictions/weekly-popular",
		);
		expect(results).toHaveLength(2);
		expect(results[0]).toMatchObject({
			provider: "royalroad",
			title: "First Fiction",
			sourceUrl: "https://www.royalroad.com/fiction/99999/first-fiction",
		});
		expect(results[0].coverImage).toMatch(/^https:\/\//);
	});
});
