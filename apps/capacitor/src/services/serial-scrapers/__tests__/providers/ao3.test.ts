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
// AO3 tests don't sit through the real 5-second gate between calls.
vi.mock("../../utils/throttle", () => ({
	throttle: vi.fn().mockResolvedValue(undefined),
}));

import { fetchHtml } from "../../fetch";
import { ao3Scraper } from "../../providers/ao3";

const FIXTURES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures/ao3");

function loadFixture(name: string): string {
	return readFileSync(path.join(FIXTURES_DIR, `${name}.html`), "utf8");
}

const mockedFetchHtml = vi.mocked(fetchHtml);

beforeEach(() => {
	mockedFetchHtml.mockReset();
});

// ─── canHandle ──────────────────────────────────────────────────────────────

describe("ao3.canHandle", () => {
	it.each([
		"https://archiveofourown.org/works/12345",
		"https://archiveofourown.org/works/12345/chapters/67890",
		"https://archiveofourown.org/works/12345?view_full_work=true",
	])("accepts %s", (url) => {
		expect(ao3Scraper.canHandle(url)).toBe(true);
	});

	it.each([
		"https://archiveofourown.org/series/12345",
		"https://archiveofourown.org/users/foo",
		"https://archiveofourown.org/",
		"https://example.com/works/123",
		"not-a-url",
	])("rejects %s", (url) => {
		expect(ao3Scraper.canHandle(url)).toBe(false);
	});
});

// ─── fetchSeriesMetadata ────────────────────────────────────────────────────

describe("ao3.fetchSeriesMetadata", () => {
	it("extracts title, author, description; cover null; tocUrl = sourceUrl + /navigate", async () => {
		mockedFetchHtml.mockResolvedValue(loadFixture("work-multi-chapter"));

		const meta = await ao3Scraper.fetchSeriesMetadata("https://archiveofourown.org/works/12345");

		expect(meta).toEqual({
			title: "A Test Work",
			author: "testauthor",
			coverImage: null,
			description: "A short summary of the test work.",
			sourceUrl: "https://archiveofourown.org/works/12345",
			tocUrl: "https://archiveofourown.org/works/12345/navigate",
			provider: "ao3",
		});
	});

	it("normalizes a chapter URL to the work root", async () => {
		mockedFetchHtml.mockResolvedValue(loadFixture("work-multi-chapter"));

		const meta = await ao3Scraper.fetchSeriesMetadata(
			"https://archiveofourown.org/works/12345/chapters/67890",
		);

		expect(meta.sourceUrl).toBe("https://archiveofourown.org/works/12345");
		expect(mockedFetchHtml).toHaveBeenCalledWith("https://archiveofourown.org/works/12345");
	});

	it("throws AO3_URL_NOT_A_WORK for a non-work URL", async () => {
		await expect(
			ao3Scraper.fetchSeriesMetadata("https://archiveofourown.org/users/foo"),
		).rejects.toThrow("AO3_URL_NOT_A_WORK");
	});
});

// ─── fetchChapterList ───────────────────────────────────────────────────────

describe("ao3.fetchChapterList", () => {
	it("parses a multi-chapter navigate page", async () => {
		mockedFetchHtml.mockResolvedValue(loadFixture("navigate-multi-chapter"));

		const refs = await ao3Scraper.fetchChapterList(
			"https://archiveofourown.org/works/12345/navigate",
		);

		expect(refs).toEqual([
			{
				index: 0,
				title: "1. Chapter One",
				sourceUrl: "https://archiveofourown.org/works/12345/chapters/100",
			},
			{
				index: 1,
				title: "2. Chapter Two",
				sourceUrl: "https://archiveofourown.org/works/12345/chapters/101",
			},
			{
				index: 2,
				title: "3. Chapter Three",
				sourceUrl: "https://archiveofourown.org/works/12345/chapters/102",
			},
		]);
	});

	it("returns one synthetic ref pointing at the work for empty navigate", async () => {
		mockedFetchHtml.mockResolvedValue(loadFixture("navigate-empty"));

		const refs = await ao3Scraper.fetchChapterList(
			"https://archiveofourown.org/works/12345/navigate",
		);

		expect(refs).toEqual([
			{
				index: 0,
				title: "Chapter 1",
				sourceUrl: "https://archiveofourown.org/works/12345",
			},
		]);
	});
});

// ─── fetchChapterContent ────────────────────────────────────────────────────

describe("ao3.fetchChapterContent", () => {
	const ref = {
		index: 0,
		title: "Chapter 1",
		sourceUrl: "https://archiveofourown.org/works/12345/chapters/100",
	};

	it("fetches and extracts visible paragraphs", async () => {
		mockedFetchHtml.mockResolvedValue(loadFixture("chapter"));

		const result = await ao3Scraper.fetchChapterContent(ref);

		expect(result.status).toBe("fetched");
		if (result.status !== "fetched") return; // narrow for TS
		expect(result.content).toContain("first paragraph of the chapter");
		expect(result.content).toContain("second visible paragraph");
	});

	it("strips display:none and aria-hidden paragraphs", async () => {
		mockedFetchHtml.mockResolvedValue(loadFixture("chapter"));

		const result = await ao3Scraper.fetchChapterContent(ref);
		if (result.status !== "fetched") throw new Error("expected fetched");

		expect(result.content).not.toContain("Hidden anti-piracy");
		expect(result.content).not.toContain("Another hidden paragraph");
	});

	it("returns CONTENT_NOT_FOUND when the .userstuff selector misses", async () => {
		mockedFetchHtml.mockResolvedValue(loadFixture("chapter-empty"));

		const result = await ao3Scraper.fetchChapterContent(ref);
		expect(result).toEqual({ status: "error", reason: "CONTENT_NOT_FOUND" });
	});

	it("returns error (not throw) when fetchHtml rejects", async () => {
		mockedFetchHtml.mockRejectedValue(new Error("FETCH_FAILED:503"));

		const result = await ao3Scraper.fetchChapterContent(ref);
		expect(result).toEqual({ status: "error", reason: "FETCH_FAILED:503" });
	});
});

// ─── search ─────────────────────────────────────────────────────────────────

describe("ao3.search", () => {
	// Narrow once so the rest of the suite uses `search(...)` not `ao3Scraper.search!(...)`.
	// If the adapter ever drops `search`, this fails the suite with a clear message.
	const search = ao3Scraper.search;
	if (!search) throw new Error("AO3 adapter must implement `search`");

	it("parses search results, absolutizes URLs, tags provider, extracts chapter count", async () => {
		mockedFetchHtml.mockResolvedValue(loadFixture("search-results"));

		const results = await search("test query");

		expect(results).toEqual([
			{
				title: "First Hit",
				author: "alice",
				description: "A summary of the first hit.",
				coverImage: null,
				chapterCount: 5,
				sourceUrl: "https://archiveofourown.org/works/100",
				provider: "ao3",
			},
			{
				title: "Second Hit",
				author: "bob",
				description: "Summary of the second hit.",
				coverImage: null,
				chapterCount: 23,
				sourceUrl: "https://archiveofourown.org/works/200",
				provider: "ao3",
			},
		]);
	});

	it("URL-encodes the query and sorts by kudos descending", async () => {
		mockedFetchHtml.mockResolvedValue(loadFixture("search-empty"));

		await search("hello & world");

		expect(mockedFetchHtml).toHaveBeenCalledWith(
			"https://archiveofourown.org/works/search?work_search%5Bquery%5D=hello%20%26%20world" +
				"&work_search%5Bsort_column%5D=kudos_count" +
				"&work_search%5Bsort_direction%5D=desc",
		);
	});

	it("returns [] when no results match", async () => {
		mockedFetchHtml.mockResolvedValue(loadFixture("search-empty"));

		const results = await search("zzzz");
		expect(results).toEqual([]);
	});
});
