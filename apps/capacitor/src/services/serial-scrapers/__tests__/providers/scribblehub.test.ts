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
// SH tests don't sit through the real 2-second gate between calls.
vi.mock("../../utils/throttle", () => ({
	throttle: vi.fn().mockResolvedValue(undefined),
}));

import { fetchHtml } from "../../fetch";
import { scribblehubScraper } from "../../providers/scribblehub";

const FIXTURES_DIR = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../fixtures/scribblehub",
);

function loadFixture(name: string): string {
	return readFileSync(path.join(FIXTURES_DIR, `${name}.html`), "utf8");
}

const mockedFetchHtml = vi.mocked(fetchHtml);

beforeEach(() => {
	mockedFetchHtml.mockReset();
});

// ─── canHandle ──────────────────────────────────────────────────────────────

describe("scribblehub.canHandle", () => {
	it.each([
		"https://www.scribblehub.com/series/958046/a-test-novel/",
		"https://www.scribblehub.com/series/958046/a-test-novel",
		"https://www.scribblehub.com/read/958046-a-test-novel/chapter/3/",
		"https://scribblehub.com/series/958046/a-test-novel/",
	])("accepts %s", (url) => {
		expect(scribblehubScraper.canHandle(url)).toBe(true);
	});

	it.each([
		"https://www.scribblehub.com/",
		"https://www.scribblehub.com/profile/123/foo/",
		"https://www.scribblehub.com/genre/action/",
		"https://archiveofourown.org/series/958046/foo/",
		"not-a-url",
	])("rejects %s", (url) => {
		expect(scribblehubScraper.canHandle(url)).toBe(false);
	});
});

// ─── fetchSeriesMetadata ────────────────────────────────────────────────────

describe("scribblehub.fetchSeriesMetadata", () => {
	it("extracts title, author, cover, description; tocUrl === sourceUrl", async () => {
		mockedFetchHtml.mockResolvedValue(loadFixture("series"));

		const meta = await scribblehubScraper.fetchSeriesMetadata(
			"https://www.scribblehub.com/series/958046/a-test-novel/",
		);

		expect(meta).toEqual({
			title: "A Test Novel",
			author: "testauthor",
			coverImage: "https://cdn.scribblehub.com/images/47/test-novel_958046.jpg",
			description: "A short summary of the test novel.",
			sourceUrl: "https://www.scribblehub.com/series/958046/a-test-novel/",
			tocUrl: "https://www.scribblehub.com/series/958046/a-test-novel/",
			provider: "scribblehub",
		});
	});

	it("normalizes a chapter URL to the series root", async () => {
		mockedFetchHtml.mockResolvedValue(loadFixture("series"));

		const meta = await scribblehubScraper.fetchSeriesMetadata(
			"https://www.scribblehub.com/read/958046-a-test-novel/chapter/3/",
		);

		expect(meta.sourceUrl).toBe("https://www.scribblehub.com/series/958046/a-test-novel/");
		expect(mockedFetchHtml).toHaveBeenCalledWith(
			"https://www.scribblehub.com/series/958046/a-test-novel/",
		);
	});

	it("throws SCRIBBLEHUB_URL_NOT_A_SERIES for a non-series URL", async () => {
		await expect(
			scribblehubScraper.fetchSeriesMetadata("https://www.scribblehub.com/profile/123/foo/"),
		).rejects.toThrow("SCRIBBLEHUB_URL_NOT_A_SERIES");
	});
});

// ─── fetchChapterList ───────────────────────────────────────────────────────

describe("scribblehub.fetchChapterList", () => {
	it("parses a multi-chapter inline TOC; absolutizes relative hrefs", async () => {
		mockedFetchHtml.mockResolvedValue(loadFixture("series"));

		const refs = await scribblehubScraper.fetchChapterList(
			"https://www.scribblehub.com/series/958046/a-test-novel/",
		);

		expect(refs).toEqual([
			{
				index: 0,
				title: "Chapter One",
				sourceUrl: "https://www.scribblehub.com/read/958046-a-test-novel/chapter/100/",
			},
			{
				index: 1,
				title: "Chapter Two",
				sourceUrl: "https://www.scribblehub.com/read/958046-a-test-novel/chapter/101/",
			},
			{
				index: 2,
				title: "Chapter Three",
				sourceUrl: "https://www.scribblehub.com/read/958046-a-test-novel/chapter/102/",
			},
		]);
	});

	it("returns one synthetic ref pointing at the series root for empty TOC", async () => {
		mockedFetchHtml.mockResolvedValue(loadFixture("series-empty-toc"));

		const tocUrl = "https://www.scribblehub.com/series/111/a-single-chapter-novel/";
		const refs = await scribblehubScraper.fetchChapterList(tocUrl);

		expect(refs).toEqual([{ index: 0, title: "Chapter 1", sourceUrl: tocUrl }]);
	});
});

// ─── fetchChapterContent ────────────────────────────────────────────────────

describe("scribblehub.fetchChapterContent", () => {
	const ref = {
		index: 0,
		title: "Chapter 1",
		sourceUrl: "https://www.scribblehub.com/read/958046-a-test-novel/chapter/100/",
	};

	it("fetches and extracts visible paragraphs", async () => {
		mockedFetchHtml.mockResolvedValue(loadFixture("chapter"));

		const result = await scribblehubScraper.fetchChapterContent(ref);

		expect(result.status).toBe("fetched");
		if (result.status !== "fetched") return; // narrow for TS
		expect(result.content).toContain("first paragraph of the chapter");
		expect(result.content).toContain("second visible paragraph");
	});

	it("strips display:none and aria-hidden paragraphs", async () => {
		mockedFetchHtml.mockResolvedValue(loadFixture("chapter"));

		const result = await scribblehubScraper.fetchChapterContent(ref);
		if (result.status !== "fetched") throw new Error("expected fetched");

		expect(result.content).not.toContain("Hidden anti-piracy");
		expect(result.content).not.toContain("Another hidden paragraph");
	});

	it("returns CONTENT_NOT_FOUND when the chp_raw selector misses", async () => {
		mockedFetchHtml.mockResolvedValue(loadFixture("chapter-empty"));

		const result = await scribblehubScraper.fetchChapterContent(ref);
		expect(result).toEqual({ status: "error", reason: "CONTENT_NOT_FOUND" });
	});

	it("returns error (not throw) when fetchHtml rejects", async () => {
		mockedFetchHtml.mockRejectedValue(new Error("FETCH_FAILED:503"));

		const result = await scribblehubScraper.fetchChapterContent(ref);
		expect(result).toEqual({ status: "error", reason: "FETCH_FAILED:503" });
	});

	it("never returns 'locked' — SH has no paywall, only fetched/error", async () => {
		// Sanity check: contract says fetchChapterContent returns 'fetched' |
		// 'error' for SH. If the adapter ever grows a 'locked' branch the
		// foundation would need provider-aware handling.
		mockedFetchHtml.mockResolvedValue(loadFixture("chapter"));
		const result = await scribblehubScraper.fetchChapterContent(ref);
		expect(result.status).not.toBe("locked");
	});
});

// ─── search ─────────────────────────────────────────────────────────────────

describe("scribblehub.search", () => {
	const search = scribblehubScraper.search;
	if (!search) throw new Error("ScribbleHub adapter must implement `search`");

	it("parses search results, absolutizes URLs, tags provider, extracts chapter count", async () => {
		mockedFetchHtml.mockResolvedValue(loadFixture("search-results"));

		const results = await search("test query");

		expect(results).toHaveLength(2);

		expect(results[0]).toEqual({
			title: "First Novel",
			author: "alice",
			description: "A summary of the first novel.",
			coverImage: "https://cdn.scribblehub.com/seriesimg/mid/47/mid_958046.jpg",
			chapterCount: 7,
			sourceUrl: "https://www.scribblehub.com/series/958046/first-novel/",
			provider: "scribblehub",
		});

		// Second result exercises: relative href absolutization, abbreviated
		// chapter count → null, and noimagefound placeholder → null cover.
		expect(results[1]).toEqual({
			title: "Second Novel",
			author: "bob",
			description: "A no-cover, abbreviated-chapter-count entry.",
			coverImage: null,
			chapterCount: null,
			sourceUrl: "https://www.scribblehub.com/series/111/second-novel/",
			provider: "scribblehub",
		});
	});

	it("URL-encodes the query and scopes to fictionposts post_type", async () => {
		mockedFetchHtml.mockResolvedValue(loadFixture("search-empty"));

		await search("hello & world");

		expect(mockedFetchHtml).toHaveBeenCalledWith(
			"https://www.scribblehub.com/?s=hello%20%26%20world&post_type=fictionposts",
		);
	});

	it("returns [] when no results match", async () => {
		mockedFetchHtml.mockResolvedValue(loadFixture("search-empty"));

		const results = await search("zzzz");
		expect(results).toEqual([]);
	});
});
