import { describe, expect, it } from "vitest";
import { toCatalogFilters } from "../explore-search";
import { describeLength, wordBounds } from "../length";

describe("wordBounds", () => {
	it("turns reading-time buckets into word bounds at the reader's speed", () => {
		expect(wordBounds("short", 300)).toEqual({ minWords: undefined, maxWords: 18_000 });
		expect(wordBounds("medium", 300)).toEqual({ minWords: 18_000, maxWords: 54_000 });
		expect(wordBounds("epic", 300)).toEqual({ minWords: 180_000, maxWords: undefined });
	});

	it("rounds the speed to steps of 25 so small shifts don't start a new search", () => {
		expect(wordBounds("short", 312)).toEqual(wordBounds("short", 300));
		expect(wordBounds("short", 290)).toEqual(wordBounds("short", 300));
		expect(wordBounds("short", 313)).toEqual({ minWords: undefined, maxWords: 19_500 });
	});
});

describe("describeLength", () => {
	it("shows pages at 250 words each and reading time at the given speed", () => {
		expect(describeLength({ wordCount: 75_000 }, 300)).toEqual({
			words: 75_000,
			text: "300 pages · 4h 10m",
			time: "4h 10m",
			spoken: "300 pages, 4 hours 10 minutes",
			spokenTime: "4 hours 10 minutes to read",
		});
	});

	it("marks an estimate, visibly with ~ and spoken with About", () => {
		expect(describeLength({ wordCount: 78_000, wordCountEstimated: true }, 312)).toMatchObject({
			text: "~312 pages · 4h 10m",
			time: "~4h 10m",
			spoken: "About 312 pages, 4 hours 10 minutes",
			spokenTime: "About 4 hours 10 minutes to read",
		});
	});

	it("rounds the badge to whole hours from 10 hours on, keeping minutes in the full text", () => {
		const long = describeLength({ wordCount: 225_000, wordCountEstimated: true }, 300);
		expect(long?.time).toBe("~13h");
		expect(long?.text).toBe("~900 pages · 12h 30m");
	});

	it("is null when the length is unknown", () => {
		expect(describeLength({ wordCount: null }, 300)).toBeNull();
		expect(describeLength({}, 300)).toBeNull();
		expect(describeLength({ wordCount: 0, wordCountEstimated: true }, 300)).toBeNull();
	});

	it("uses singulars, groups thousands and says under a minute", () => {
		expect(describeLength({ wordCount: 120 }, 240)).toMatchObject({
			text: "1 page · < 1 min",
			spoken: "1 page, under a minute",
			spokenTime: "Under a minute to read",
		});
		expect(describeLength({ wordCount: 806_306 }, 250)?.text).toBe("3,226 pages · 53h 45m");
		expect(describeLength({ wordCount: 15_000 }, 250)?.spoken).toBe("60 pages, 1 hour");
	});
});

describe("toCatalogFilters", () => {
	it("combines every filter and the length bucket into one request", () => {
		expect(
			toCatalogFilters(
				{ q: "sea", genre: "adventure", tags: "sea-stories", source: "gutenberg", length: "short" },
				"en",
				250,
			),
		).toEqual({
			q: "sea",
			lang: "en",
			genre: "adventure",
			tags: ["sea-stories"],
			source: "gutenberg",
			sort: "relevance",
			minWords: undefined,
			maxWords: 15_000,
		});
	});
});
