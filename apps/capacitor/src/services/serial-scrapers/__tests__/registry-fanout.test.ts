import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock all registered providers so we control whether `search` exists and
// what it returns. The registry imports all at load time, so these mocks
// must be declared before the registry import.
//
// We only drive AO3 in the assertions; SH and RR stay quiet stubs that return
// `[]` so they never add noise to `failedProviders` or merged results. When a
// future test wants to exercise a specific provider's fan-out shape, give it
// its own mock-resolved value.
vi.mock("../providers/ao3", () => ({
	ao3Scraper: {
		id: "ao3" as const,
		canHandle: () => false,
		fetchSeriesMetadata: vi.fn(),
		fetchChapterList: vi.fn(),
		fetchChapterContent: vi.fn(),
		search: vi.fn(),
	},
}));

vi.mock("../providers/scribblehub", () => ({
	scribblehubScraper: {
		id: "scribblehub" as const,
		canHandle: () => false,
		fetchSeriesMetadata: vi.fn(),
		fetchChapterList: vi.fn(),
		fetchChapterContent: vi.fn(),
		search: vi.fn().mockResolvedValue([]),
	},
}));

vi.mock("../providers/royalroad", () => ({
	royalroadScraper: {
		id: "royalroad" as const,
		canHandle: () => false,
		fetchSeriesMetadata: vi.fn(),
		fetchChapterList: vi.fn(),
		fetchChapterContent: vi.fn(),
		search: vi.fn().mockResolvedValue([]),
	},
}));

vi.mock("../providers/wuxiaworld", () => ({
	wuxiaworldScraper: {
		id: "wuxiaworld" as const,
		canHandle: () => false,
		fetchSeriesMetadata: vi.fn(),
		fetchChapterList: vi.fn(),
		fetchChapterContent: vi.fn(),
		search: vi.fn().mockResolvedValue([]),
	},
}));

import { ao3Scraper } from "../providers/ao3";
import { searchAll } from "../registry";

type MutableScraper = typeof ao3Scraper & { search?: typeof ao3Scraper.search };

const fake = ao3Scraper as MutableScraper;
// Snapshot the mock's `search` fn from the vi.mock factory above. Tests can
// reassign `fake.search` (e.g. set to undefined to simulate a no-search adapter)
// and beforeEach restores. If a future contributor changes the factory shape,
// update this snapshot pattern alongside.
const originalSearch = fake.search;

beforeEach(() => {
	fake.search = originalSearch;
	if (!originalSearch) throw new Error("mock factory must define `search`");
	vi.mocked(originalSearch).mockReset();
});

describe("searchAll fan-out", () => {
	it("forwards a single provider's results unchanged", async () => {
		vi.mocked(fake.search!).mockResolvedValue([
			{
				title: "T",
				author: null,
				description: null,
				coverImage: null,
				sourceUrl: "https://archiveofourown.org/works/1",
				provider: "ao3",
			},
		]);

		const r = await searchAll("hello");
		expect(r.failedProviders).toEqual([]);
		expect(r.results.map((x) => x.title)).toEqual(["T"]);
	});

	it("skips providers with no `search` method (no error, no entry in failedProviders)", async () => {
		fake.search = undefined;

		const r = await searchAll("hello");
		expect(r).toEqual({ results: [], failedProviders: [] });
	});

	it("collects rejecting provider ids in failedProviders without dropping the call", async () => {
		vi.mocked(fake.search!).mockRejectedValue(new Error("boom"));

		const r = await searchAll("hello");
		expect(r.results).toEqual([]);
		expect(r.failedProviders).toEqual(["ao3"]);
	});

	it("ranks All-view results by cover then chapter bucket", async () => {
		// AO3 returns the only mock with results; we mix three items varying in
		// cover presence + chapter count to assert the sort key.
		vi.mocked(fake.search!).mockResolvedValue([
			{
				title: "no-cover-many-ch",
				author: null,
				description: null,
				coverImage: null,
				chapterCount: 200,
				sourceUrl: "https://archiveofourown.org/works/1",
				provider: "ao3",
			},
			{
				title: "cover-no-ch",
				author: null,
				description: null,
				coverImage: "https://x/cover.jpg",
				chapterCount: 0,
				sourceUrl: "https://archiveofourown.org/works/2",
				provider: "ao3",
			},
			{
				title: "cover-many-ch",
				author: null,
				description: null,
				coverImage: "https://x/cover.jpg",
				chapterCount: 80,
				sourceUrl: "https://archiveofourown.org/works/3",
				provider: "ao3",
			},
		]);

		const r = await searchAll("hello");
		expect(r.results.map((x) => x.title)).toEqual([
			"cover-many-ch",
			"cover-no-ch",
			"no-cover-many-ch",
		]);
	});

	it("leaves provider-locked results unsorted", async () => {
		vi.mocked(fake.search!).mockResolvedValue([
			{
				title: "first",
				author: null,
				description: null,
				coverImage: null,
				chapterCount: 0,
				sourceUrl: "https://archiveofourown.org/works/1",
				provider: "ao3",
			},
			{
				title: "second",
				author: null,
				description: null,
				coverImage: "https://x/cover.jpg",
				chapterCount: 100,
				sourceUrl: "https://archiveofourown.org/works/2",
				provider: "ao3",
			},
		]);

		const r = await searchAll("hello", { provider: "ao3" });
		expect(r.results.map((x) => x.title)).toEqual(["first", "second"]);
	});

	it("opts.provider filters fan-out to a single provider", async () => {
		// Matching id: provider runs.
		vi.mocked(fake.search!).mockResolvedValue([
			{
				title: "Match",
				author: null,
				description: null,
				coverImage: null,
				sourceUrl: "https://archiveofourown.org/works/1",
				provider: "ao3",
			},
		]);

		const matched = await searchAll("hello", { provider: "ao3" });
		expect(matched.results.map((x) => x.title)).toEqual(["Match"]);
		expect(fake.search).toHaveBeenCalledTimes(1);

		// Non-matching id: AO3 stays unqueried, registry returns an empty result.
		vi.mocked(fake.search!).mockClear();
		const skipped = await searchAll("hello", { provider: "scribblehub" });
		expect(skipped).toEqual({ results: [], failedProviders: [] });
		expect(fake.search).not.toHaveBeenCalled();
	});
});
