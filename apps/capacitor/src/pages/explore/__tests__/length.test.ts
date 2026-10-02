import { describe, expect, it } from "vitest";
import { toCatalogFilters } from "../explore-search";
import { readingTimeLabel, wordBounds } from "../length";

describe("wordBounds", () => {
	it("turns reading-time buckets into word bounds at the reader's speed", () => {
		expect(wordBounds("short", 300)).toEqual({ minWords: undefined, maxWords: 18_000 });
		expect(wordBounds("medium", 300)).toEqual({ minWords: 18_000, maxWords: 54_000 });
		expect(wordBounds("epic", 300)).toEqual({ minWords: 180_000, maxWords: undefined });
	});
});

describe("readingTimeLabel", () => {
	it("formats minutes and hours, and says nothing for an uncounted book", () => {
		expect(readingTimeLabel(9_000, 300)).toBe("30 min");
		expect(readingTimeLabel(39_000, 300)).toBe("2h 10m");
		expect(readingTimeLabel(null, 300)).toBeNull();
		expect(readingTimeLabel(0, 300)).toBeNull();
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
