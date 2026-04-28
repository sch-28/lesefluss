/**
 * Unit tests for `pollChapterList` in pipeline.ts.
 *
 * Mocks: DB queries, scraper registry, syncChapterList. This tests only the
 * pipeline orchestration — TOC fetching and diff logic are tested separately.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("../../db/queries", () => ({
	queries: {
		getSeries: vi.fn(),
	},
}));

// Mock the commit module so pollChapterList's call to syncChapterList is
// controlled here without re-testing the diff logic.
vi.mock("../commit", () => ({
	commitSeries: vi.fn(),
	commitChapter: vi.fn(),
	removeSerial: vi.fn(),
	syncChapterList: vi.fn(),
}));

// Mock the registry so we can inject a controlled scraper stub.
vi.mock("../registry", () => ({
	detectScraper: vi.fn(),
	scrapersById: {} as Record<string, unknown>,
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import { queries } from "../../db/queries";
import { syncChapterList } from "../commit";
import { pollChapterList } from "../pipeline";
import { scrapersById } from "../registry";

// ── Helpers ───────────────────────────────────────────────────────────────────

const SERIES = {
	id: "series1",
	provider: "ao3",
	tocUrl: "https://archiveofourown.org/works/123/navigate",
	sourceUrl: "https://archiveofourown.org/works/123",
};

const REFS = [
	{ index: 0, title: "Ch 1", sourceUrl: "https://archiveofourown.org/works/123/chapters/1" },
];

// Cast the imported read-only object so we can inject a stub scraper.
const scrapers = scrapersById as Record<string, unknown>;
let mockFetchChapterList: ReturnType<typeof vi.fn>;

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(queries.getSeries).mockResolvedValue(SERIES as never);
	vi.mocked(syncChapterList).mockResolvedValue({ added: 0 });
	mockFetchChapterList = vi.fn().mockResolvedValue(REFS);
	scrapers.ao3 = { id: "ao3", fetchChapterList: mockFetchChapterList };
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("pollChapterList", () => {
	it("fetches TOC and delegates to syncChapterList", async () => {
		const result = await pollChapterList("series1");

		expect(mockFetchChapterList).toHaveBeenCalledWith(SERIES.tocUrl);
		expect(syncChapterList).toHaveBeenCalledWith("series1", REFS);
		expect(result).toEqual({ added: 0 });
	});

	it("propagates the added count from syncChapterList", async () => {
		vi.mocked(syncChapterList).mockResolvedValue({ added: 3 });

		const result = await pollChapterList("series1");

		expect(result).toEqual({ added: 3 });
	});

	it("throws SERIES_MISSING when the series row is not found", async () => {
		vi.mocked(queries.getSeries).mockResolvedValue(undefined);

		await expect(pollChapterList("missing")).rejects.toThrow("SERIES_MISSING");
	});

	it("throws NO_SCRAPER when provider has no registered adapter", async () => {
		vi.mocked(queries.getSeries).mockResolvedValue({
			...SERIES,
			provider: "unknown-provider",
		} as never);

		await expect(pollChapterList("series1")).rejects.toThrow("NO_SCRAPER");
	});
});
