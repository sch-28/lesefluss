import { describe, expect, it } from "vitest";
import {
	bookStatus,
	FINISHED_PERCENT_THRESHOLD,
	nextRating,
	RATING_MAX,
	RATING_STARS,
	ratingStars,
	readingProgress,
} from "../books";

describe("bookStatus", () => {
	it("derives from progress when no status is stored", () => {
		expect(bookStatus({ wordCount: 100, wordPosition: 0 })).toBe("want");
		expect(bookStatus({ wordCount: 100, wordPosition: 50 })).toBe("reading");
		expect(bookStatus({ wordCount: 100, wordPosition: FINISHED_PERCENT_THRESHOLD })).toBe(
			"finished",
		);
	});

	it("treats a book with no word count as unstarted", () => {
		expect(bookStatus({ wordCount: 0, wordPosition: 0 })).toBe("want");
	});

	// The whole point of the column: a decision the reader made outranks whatever
	// the reading position implies, and keeps outranking it.
	it("keeps a stored status regardless of progress", () => {
		expect(bookStatus({ wordCount: 100, wordPosition: 100, status: "dropped" })).toBe("dropped");
		expect(bookStatus({ wordCount: 100, wordPosition: 0, status: "finished" })).toBe("finished");
	});

	it("falls back to derivation for an unrecognised stored value", () => {
		expect(bookStatus({ wordCount: 100, wordPosition: 50, status: "abandoned" })).toBe("reading");
		expect(bookStatus({ wordCount: 100, wordPosition: 50, status: null })).toBe("reading");
	});
});

describe("nextRating", () => {
	it("sets a star full when it was not the current rating", () => {
		expect(nextRating(null, 4)).toBe(8);
		expect(nextRating(6, 4)).toBe(8);
	});

	it("drops to half when the tapped star is already full", () => {
		expect(nextRating(8, 4)).toBe(7);
	});

	it("returns to full on the next tap, so a half is never a dead end", () => {
		expect(nextRating(7, 4)).toBe(8);
	});

	it("handles a half on the first star", () => {
		expect(nextRating(null, 1)).toBe(2);
		expect(nextRating(2, 1)).toBe(1);
		expect(nextRating(1, 1)).toBe(2);
	});

	it("jumps to the tapped star rather than stepping", () => {
		expect(nextRating(9, 2)).toBe(4);
	});

	it("never leaves the 1..10 range", () => {
		for (let star = 1; star <= RATING_STARS; star++) {
			for (const current of [null, 1, 5, 9, 10]) {
				const next = nextRating(current, star);
				expect(next).toBeGreaterThanOrEqual(1);
				expect(next).toBeLessThanOrEqual(RATING_MAX);
			}
		}
	});
});

describe("ratingStars", () => {
	it("converts half-star units to stars", () => {
		expect(ratingStars(10)).toBe(5);
		expect(ratingStars(7)).toBe(3.5);
		expect(ratingStars(1)).toBe(0.5);
	});
});

describe("readingProgress", () => {
	it("clamps past the end of the book", () => {
		expect(readingProgress({ wordCount: 100, wordPosition: 120 })).toBe(100);
	});

	it("reports zero when the word count is unknown", () => {
		expect(readingProgress({ wordCount: 0, wordPosition: 42 })).toBe(0);
	});
});
