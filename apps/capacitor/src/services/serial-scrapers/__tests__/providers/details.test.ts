import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../fetch", () => ({ fetchHtml: vi.fn() }));
vi.mock("../../utils/throttle", () => ({
	throttle: vi.fn(async () => undefined),
	platformThrottleMs: () => 0,
}));

import { fetchHtml } from "../../fetch";
import { ao3Scraper, parseWorkDetails } from "../../providers/ao3";
import { parseFictionDetails, royalroadScraper } from "../../providers/royalroad";
import { parseHtml } from "../../utils/html";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "../fixtures");
const fixture = (path: string) => readFileSync(join(FIXTURES, path), "utf8");
const mockedFetchHtml = vi.mocked(fetchHtml);

beforeEach(() => {
	mockedFetchHtml.mockReset();
	mockedFetchHtml.mockResolvedValue("<html><body></body></html>");
});

describe("Royal Road details", () => {
	it("parses tags, status, rating, followers, last update and the exact word count", () => {
		expect(parseFictionDetails(parseHtml(fixture("royalroad/fiction-details.html")))).toEqual({
			tags: ["Time Loop", "Adventure", "Fantasy"],
			status: "completed",
			rating: 4.83,
			ratingCount: 17569,
			lastUpdated: "2023-07-06",
			followers: 33886,
			wordCount: 806_306,
		});
	});

	it("returns nothing for a page without the blocks", () => {
		expect(parseFictionDetails(parseHtml(fixture("royalroad/fiction.html")))).toEqual({});
	});

	it("carries details through fetchSeriesMetadata", async () => {
		mockedFetchHtml.mockResolvedValue(fixture("royalroad/fiction-details.html"));
		const meta = await royalroadScraper.fetchSeriesMetadata(
			"https://www.royalroad.com/fiction/21220/mother-of-learning",
		);
		expect(meta.details?.status).toBe("completed");
	});

	it("pages and filters search by status", async () => {
		await royalroadScraper.search?.("cradle", { page: 3, status: "completed" });
		const url = new URL(mockedFetchHtml.mock.calls[0]?.[0] as string);
		expect(url.pathname).toBe("/fictions/search");
		expect(url.searchParams.get("title")).toBe("cradle");
		expect(url.searchParams.get("page")).toBe("3");
		expect(url.searchParams.get("status")).toBe("COMPLETED");
	});

	it("maps popular windows to RR listings", async () => {
		await royalroadScraper.getPopular?.({ window: "all-time" });
		await royalroadScraper.getPopular?.({ window: "trending" });
		await royalroadScraper.getPopular?.();
		expect(mockedFetchHtml.mock.calls.map((c) => new URL(c[0] as string).pathname)).toEqual([
			"/fictions/best-rated",
			"/fictions/trending",
			"/fictions/weekly-popular",
		]);
	});
});

describe("AO3 details", () => {
	it("parses rating, warnings, fandoms, relationships, tags and stats", () => {
		expect(parseWorkDetails(parseHtml(fixture("ao3/work-details.html")))).toEqual({
			ao3: {
				rating: ["General Audiences"],
				warnings: ["No Archive Warnings Apply"],
				fandoms: ["Sherlock (TV)", "Sherlock Holmes & Related Fandoms"],
				relationships: ["Sherlock Holmes/John Watson"],
			},
			tags: ["Humor", "Fluff"],
			status: "ongoing",
			lastUpdated: "2012-03-04",
			wordCount: 21911,
			kudos: 61675,
		});
	});

	it("reads n/n chapters as completed and falls back to the published date", () => {
		const html = fixture("ao3/work-details.html")
			.replace("5/?", "5/5")
			.replace('<dt class="status">Updated:</dt><dd class="status">2012-03-04</dd>', "");
		const details = parseWorkDetails(parseHtml(html));
		expect(details.status).toBe("completed");
		expect(details.lastUpdated).toBe("2011-12-27");
	});

	it("returns nothing for a page without the meta block", () => {
		expect(parseWorkDetails(parseHtml(fixture("ao3/work-multi-chapter.html")))).toEqual({});
	});

	it("pages and filters search by completion", async () => {
		await ao3Scraper.search?.("sherlock", { page: 2, status: "completed" });
		const url = new URL(mockedFetchHtml.mock.calls[0]?.[0] as string);
		expect(url.searchParams.get("work_search[complete]")).toBe("T");
		expect(url.searchParams.get("page")).toBe("2");
		mockedFetchHtml.mockClear();
		await ao3Scraper.search?.("sherlock", { status: "ongoing" });
		const second = new URL(mockedFetchHtml.mock.calls[0]?.[0] as string);
		expect(second.searchParams.get("work_search[complete]")).toBe("F");
		expect(second.searchParams.get("page")).toBeNull();
	});
});

describe("Royal Road stock cover", () => {
	it("treats the no-cover placeholder as no cover", async () => {
		mockedFetchHtml.mockResolvedValue(
			fixture("royalroad/fiction.html").replace(
				/src="https:\/\/www\.royalroadcdn\.com[^"]*"/,
				'src="/dist/img/nocover-new-min.png"',
			),
		);
		const meta = await royalroadScraper.fetchSeriesMetadata(
			"https://www.royalroad.com/fiction/99999/a-test-fiction",
		);
		expect(meta.coverImage).toBeNull();
	});
});

describe("capabilities", () => {
	it("are declared only where the provider supports them", () => {
		expect(royalroadScraper.capabilities).toEqual({
			searchPaging: true,
			statusFilter: true,
			popularWindows: ["week", "trending", "all-time"],
		});
		expect(ao3Scraper.capabilities).toEqual({ searchPaging: true, statusFilter: true });
	});
});
