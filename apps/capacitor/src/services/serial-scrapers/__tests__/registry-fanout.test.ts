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
		getPopular: vi.fn(),
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
		getPopular: vi.fn().mockResolvedValue([]),
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
		getPopular: vi.fn().mockResolvedValue([]),
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
		getPopular: vi.fn().mockResolvedValue([]),
	},
}));

import { ao3Scraper } from "../providers/ao3";
import { popularAll, searchAll } from "../registry";

type MutableScraper = typeof ao3Scraper & {
	search?: typeof ao3Scraper.search;
	getPopular?: typeof ao3Scraper.getPopular;
};

const fake = ao3Scraper as MutableScraper;
// Snapshot the mock fns from the vi.mock factory above. Tests can reassign
// (e.g. set to undefined to simulate a no-method adapter) and beforeEach
// restores. The NonNullable cast reflects the factory's guarantee that both
// methods are provably defined at module load.
if (!fake.search) throw new Error("mock factory must define `search`");
if (!fake.getPopular) throw new Error("mock factory must define `getPopular`");
const originalSearch = fake.search as NonNullable<typeof fake.search>;
const originalGetPopular = fake.getPopular as NonNullable<typeof fake.getPopular>;

beforeEach(() => {
	fake.search = originalSearch;
	fake.getPopular = originalGetPopular;
	vi.mocked(originalSearch).mockReset();
	vi.mocked(originalGetPopular).mockReset();
});

describe("searchAll fan-out", () => {
	it("forwards a single provider's results unchanged", async () => {
		vi.mocked(originalSearch).mockResolvedValue([
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
		expect(r).toEqual({ results: [], failedProviders: [], challengeProviders: [] });
	});

	it("collects rejecting provider ids in failedProviders without dropping the call", async () => {
		vi.mocked(originalSearch).mockRejectedValue(new Error("boom"));

		const r = await searchAll("hello");
		expect(r.results).toEqual([]);
		expect(r.failedProviders).toEqual(["ao3"]);
		expect(r.challengeProviders).toEqual([]);
	});

	it("routes CLOUDFLARE_CHALLENGE rejections to challengeProviders, not failedProviders", async () => {
		vi.mocked(originalSearch).mockRejectedValue(new Error("CLOUDFLARE_CHALLENGE"));

		const r = await searchAll("hello");
		expect(r.results).toEqual([]);
		expect(r.challengeProviders).toEqual(["ao3"]);
		expect(r.failedProviders).toEqual([]);
	});

	it("ranks All-view results by cover then chapter bucket", async () => {
		// AO3 returns the only mock with results; we mix three items varying in
		// cover presence + chapter count to assert the sort key.
		vi.mocked(originalSearch).mockResolvedValue([
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
		vi.mocked(originalSearch).mockResolvedValue([
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
		vi.mocked(originalSearch).mockResolvedValue([
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
		vi.mocked(originalSearch).mockClear();
		const skipped = await searchAll("hello", { provider: "scribblehub" });
		expect(skipped).toEqual({ results: [], failedProviders: [], challengeProviders: [] });
		expect(fake.search).not.toHaveBeenCalled();
	});
});

describe("popularAll fan-out", () => {
	it("forwards a single provider's popular results unchanged", async () => {
		vi.mocked(originalGetPopular).mockResolvedValue([
			{
				title: "Top",
				author: null,
				description: null,
				coverImage: null,
				sourceUrl: "https://archiveofourown.org/works/1",
				provider: "ao3",
			},
		]);

		const r = await popularAll();
		expect(r.failedProviders).toEqual([]);
		expect(r.results.map((x) => x.title)).toEqual(["Top"]);
	});

	it("skips providers with no `getPopular` method (no error, no entry in failedProviders)", async () => {
		fake.getPopular = undefined;

		const r = await popularAll();
		expect(r).toEqual({ results: [], failedProviders: [], challengeProviders: [] });
	});

	it("collects rejecting provider ids in failedProviders without dropping the call", async () => {
		vi.mocked(originalGetPopular).mockRejectedValue(new Error("boom"));

		const r = await popularAll();
		expect(r.results).toEqual([]);
		expect(r.failedProviders).toEqual(["ao3"]);
		expect(r.challengeProviders).toEqual([]);
	});

	it("routes CLOUDFLARE_CHALLENGE rejections to challengeProviders, not failedProviders", async () => {
		vi.mocked(originalGetPopular).mockRejectedValue(new Error("CLOUDFLARE_CHALLENGE"));

		const r = await popularAll();
		expect(r.results).toEqual([]);
		expect(r.challengeProviders).toEqual(["ao3"]);
		expect(r.failedProviders).toEqual([]);
	});

	it("ranks All-view popular results by qualityScore (cover then chapter bucket)", async () => {
		vi.mocked(originalGetPopular).mockResolvedValue([
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
				title: "cover-many-ch",
				author: null,
				description: null,
				coverImage: "https://x/cover.jpg",
				chapterCount: 80,
				sourceUrl: "https://archiveofourown.org/works/2",
				provider: "ao3",
			},
		]);

		const r = await popularAll();
		expect(r.results.map((x) => x.title)).toEqual(["cover-many-ch", "no-cover-many-ch"]);
	});

	it("opts.provider filters fan-out to a single provider", async () => {
		vi.mocked(originalGetPopular).mockResolvedValue([
			{
				title: "AO3-popular",
				author: null,
				description: null,
				coverImage: null,
				sourceUrl: "https://archiveofourown.org/works/1",
				provider: "ao3",
			},
		]);

		const matched = await popularAll({ provider: "ao3" });
		expect(matched.results.map((x) => x.title)).toEqual(["AO3-popular"]);
		expect(fake.getPopular).toHaveBeenCalledTimes(1);

		vi.mocked(originalGetPopular).mockClear();
		const skipped = await popularAll({ provider: "scribblehub" });
		expect(skipped.results).toEqual([]);
		expect(fake.getPopular).not.toHaveBeenCalled();
	});

	it("excludes isIncludedInAllPopular:false scrapers from all-view but runs them when explicitly selected", async () => {
		(fake as MutableScraper & { isIncludedInAllPopular: boolean }).isIncludedInAllPopular = false;
		vi.mocked(originalGetPopular).mockResolvedValue([
			{
				title: "AO3-excluded",
				author: null,
				description: null,
				coverImage: null,
				sourceUrl: "https://archiveofourown.org/works/1",
				provider: "ao3",
			},
		]);

		const allView = await popularAll();
		expect(allView.results.map((x) => x.title)).not.toContain("AO3-excluded");
		expect(fake.getPopular).not.toHaveBeenCalled();

		const explicit = await popularAll({ provider: "ao3" });
		expect(explicit.results.map((x) => x.title)).toContain("AO3-excluded");
		expect(fake.getPopular).toHaveBeenCalledTimes(1);

		delete (fake as MutableScraper & { isIncludedInAllPopular?: boolean }).isIncludedInAllPopular;
	});
});
