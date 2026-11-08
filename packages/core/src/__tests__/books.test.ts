import { describe, expect, it } from "vitest";
import {
	bookStatus,
	displayAuthor,
	FINISHED_PERCENT_THRESHOLD,
	nextRating,
	RATING_MAX,
	RATING_STARS,
	ratingStars,
	readingProgress,
	statusAfterRealSitting,
} from "../books";

describe("bookStatus", () => {
	it("derives from progress when no status is stored", () => {
		expect(bookStatus({ wordCount: 100, wordPosition: 0 })).toBe("want");
		expect(bookStatus({ wordCount: 100, wordPosition: 50 })).toBe("reading");
		expect(bookStatus({ wordCount: 100, wordPosition: FINISHED_PERCENT_THRESHOLD })).toBe(
			"finished",
		);
	});

	it("counts a long book as reading before its progress rounds up to 1%", () => {
		expect(bookStatus({ wordCount: 1_200_000, wordPosition: 2_000 })).toBe("reading");
	});

	it("keeps a book that once crossed the finished threshold finished through a reread", () => {
		expect(bookStatus({ wordCount: 100, wordPosition: 10, finishedAt: 5000 })).toBe("finished");
		expect(bookStatus({ wordCount: 100, wordPosition: 10, finishedAt: null })).toBe("reading");
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

describe("statusAfterRealSitting", () => {
	it("returns Want to read and Dropped to automatic, which a saved position reads as Reading", () => {
		for (const status of ["want", "dropped"] as const) {
			expect(statusAfterRealSitting({ status })).toBeNull();
			expect(
				bookStatus({
					wordCount: 100,
					wordPosition: 10,
					status: statusAfterRealSitting({ status }),
				}),
			).toBe("reading");
		}
	});

	it("sets Reading on a book once finished and set aside, where automatic would say Finished", () => {
		for (const status of ["want", "dropped"] as const) {
			const book = { wordCount: 100, wordPosition: 10, status, finishedAt: 1 };
			expect(bookStatus({ ...book, status: statusAfterRealSitting(book) })).toBe("reading");
		}
	});

	it("leaves Finished, manual Reading and automatic alone", () => {
		expect(statusAfterRealSitting({ status: "finished", finishedAt: 1 })).toBeUndefined();
		expect(statusAfterRealSitting({ status: "reading" })).toBeUndefined();
		expect(statusAfterRealSitting({ status: null, finishedAt: 1 })).toBeUndefined();
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

describe("displayAuthor", () => {
	it("turns a catalogue's Last, First around", () => {
		expect(displayAuthor("Kristoff, Jay")).toBe("Jay Kristoff");
		expect(displayAuthor("Le Guin, Ursula K.")).toBe("Ursula K. Le Guin");
		expect(displayAuthor("van Gogh, Vincent")).toBe("Vincent van Gogh");
	});

	it("leaves First Last, suffixes and lists of full names as they are", () => {
		expect(displayAuthor("Jay Kristoff")).toBe("Jay Kristoff");
		expect(displayAuthor("Martin Luther King, Jr.")).toBe("Martin Luther King, Jr.");
		expect(displayAuthor("Jay Kristoff, Amie Kaufman")).toBe("Jay Kristoff, Amie Kaufman");
		expect(displayAuthor("Tolkien, J. R. R., Tolkien, Christopher")).toBe(
			"Tolkien, J. R. R., Tolkien, Christopher",
		);
	});

	it("turns each name of a list around", () => {
		expect(displayAuthor("Kaufman, Amie & Kristoff, Jay")).toBe("Amie Kaufman & Jay Kristoff");
		expect(displayAuthor("Pratchett, Terry; Gaiman, Neil")).toBe("Terry Pratchett; Neil Gaiman");
	});
});
