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
	platformThrottleMs: (native: number, _catalog: number) => native,
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

	it("retries with ?view_full_work=true when the first fetch yields no title (multi-chapter 302 case)", async () => {
		// First fetch: AO3 302's the work root to chapter 1, but the HTTP client
		// surfaced an empty body — no #workskin, no title. Adapter falls back.
		mockedFetchHtml.mockResolvedValueOnce("<!doctype html><html><body></body></html>");
		mockedFetchHtml.mockResolvedValueOnce(loadFixture("work-multi-chapter"));

		const meta = await ao3Scraper.fetchSeriesMetadata("https://archiveofourown.org/works/12345");

		expect(meta.title).toBe("A Test Work");
		expect(mockedFetchHtml).toHaveBeenNthCalledWith(1, "https://archiveofourown.org/works/12345");
		expect(mockedFetchHtml).toHaveBeenNthCalledWith(
			2,
			"https://archiveofourown.org/works/12345?view_full_work=true&view_adult=true",
		);
	});

	it("throws AO3_TITLE_NOT_FOUND with the URL when both the primary fetch and the fallback yield no title", async () => {
		mockedFetchHtml.mockResolvedValue("<!doctype html><html><body></body></html>");

		await expect(
			ao3Scraper.fetchSeriesMetadata("https://archiveofourown.org/works/12345"),
		).rejects.toThrow("AO3_TITLE_NOT_FOUND:https://archiveofourown.org/works/12345");
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

	it("returns AO3_CONTENT_NOT_FOUND with the URL when the .userstuff selector misses", async () => {
		mockedFetchHtml.mockResolvedValue(loadFixture("chapter-empty"));

		const result = await ao3Scraper.fetchChapterContent(ref);
		expect(result).toEqual({
			status: "error",
			reason: `AO3_CONTENT_NOT_FOUND:${ref.sourceUrl}`,
		});
	});

	it("returns error with the URL appended when fetchHtml rejects", async () => {
		mockedFetchHtml.mockRejectedValue(new Error("FETCH_FAILED:503"));

		const result = await ao3Scraper.fetchChapterContent(ref);
		expect(result).toEqual({
			status: "error",
			reason: `FETCH_FAILED:503 (${ref.sourceUrl})`,
		});
	});

	it("picks the chapter body, not the work summary/notes blockquotes", async () => {
		// Real AO3 work pages render up to three `.userstuff` elements:
		//   <blockquote class="userstuff">  ← Summary (first in DOM)
		//   <blockquote class="userstuff">  ← Notes
		//   <div class="userstuff module" role="article">  ← actual chapter body
		// A naive `.userstuff` selector picks the summary. Repro: "Yesterday
		// Upon The Stair" / work 48763867.
		const html = `
			<div id="workskin">
				<div class="preface group">
					<h2 class="title heading">Test Work</h2>
					<div class="summary module">
						<h3 class="heading">Summary:</h3>
						<blockquote class="userstuff">
							<p>SUMMARY_TEXT_DO_NOT_PICK_THIS</p>
						</blockquote>
					</div>
					<div class="notes module">
						<h3 class="heading">Notes:</h3>
						<blockquote class="userstuff">
							<p>NOTES_TEXT_DO_NOT_PICK_THIS</p>
						</blockquote>
					</div>
				</div>
				<div class="userstuff module" role="article">
					<h3 class="landmark heading" id="work">Chapter Text</h3>
					<p>The actual chapter body begins here.</p>
				</div>
			</div>
		`;
		mockedFetchHtml.mockResolvedValue(html);

		const result = await ao3Scraper.fetchChapterContent(ref);
		if (result.status !== "fetched") throw new Error(`expected fetched, got ${result.status}`);
		expect(result.content).toContain("The actual chapter body begins here");
		expect(result.content).not.toContain("SUMMARY_TEXT_DO_NOT_PICK_THIS");
		expect(result.content).not.toContain("NOTES_TEXT_DO_NOT_PICK_THIS");
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

describe("ao3.getPopular", () => {
	const getPopular = ao3Scraper.getPopular;
	if (!getPopular) throw new Error("AO3 adapter must implement `getPopular`");

	it("hits works-search with empty query + kudos sort, parses the same markup", async () => {
		mockedFetchHtml.mockResolvedValue(loadFixture("search-results"));

		const results = await getPopular();

		expect(mockedFetchHtml).toHaveBeenCalledWith(
			"https://archiveofourown.org/works/search?work_search%5Bquery%5D=" +
				"&work_search%5Bsort_column%5D=kudos_count" +
				"&work_search%5Bsort_direction%5D=desc",
		);
		expect(results.length).toBeGreaterThan(0);
		expect(results[0].provider).toBe("ao3");
		expect(results[0].coverImage).toBeNull();
	});
});
