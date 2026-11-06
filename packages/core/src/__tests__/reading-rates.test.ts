import { describe, expect, it } from "vitest";
import { isMeasurableSitting, rollUpWorks } from "../reading-rates";

const minutes = (n: number) => n * 60_000;

describe("rollUpWorks", () => {
	function book(overrides: Partial<Parameters<typeof rollUpWorks>[0][number]> = {}) {
		return {
			bookId: "b1",
			seriesId: null,
			title: "A Book",
			author: "Someone",
			wordCount: 50_000,
			wordPosition: 10_000,
			durationMs: minutes(60),
			...overrides,
		};
	}

	it("keeps standalone books as their own work", () => {
		const works = rollUpWorks([book({ bookId: "a" }), book({ bookId: "b" })]);
		expect(works.map((w) => w.workId)).toEqual(["a", "b"]);
		expect(works.every((w) => !w.isSeries)).toBe(true);
		// A standalone book's own length and position pass straight through.
		expect(works[0]?.wordCount).toBe(50_000);
		expect(works[0]?.wordPosition).toBe(10_000);
	});

	// The whole point: 400 chapter rows must not crowd out every real book.
	it("folds a serial's chapters into one entry", () => {
		const chapters = Array.from({ length: 40 }, (_, i) =>
			book({ bookId: `c${i}`, seriesId: "s1", title: `Chapter ${i}`, durationMs: minutes(3) }),
		);
		const works = rollUpWorks([...chapters, book({ bookId: "solo", durationMs: minutes(30) })]);
		expect(works).toHaveLength(2);
		const serial = works.find((w) => w.workId === "s1");
		expect(serial?.isSeries).toBe(true);
		expect(serial?.durationMs).toBe(minutes(120));
	});

	// A serial's length is the sum of every chapter, fetched separately; counting
	// only the chapters read in this window would understate it badly.
	it("leaves a serial's length and position to be filled in later", () => {
		const works = rollUpWorks([book({ seriesId: "s1" })]);
		expect(works[0]?.wordCount).toBe(0);
		// Same reason as wordCount: one chapter's position says nothing about how
		// far through the serial the reader is.
		expect(works[0]?.wordPosition).toBe(0);
	});

	it("orders by time read, longest first", () => {
		const works = rollUpWorks([
			book({ bookId: "short", durationMs: minutes(5) }),
			book({ bookId: "long", durationMs: minutes(50) }),
		]);
		expect(works.map((w) => w.workId)).toEqual(["long", "short"]);
	});

	// The bridge adapter maps rows positionally, so a driver returning undefined
	// or an empty string for a null column must not send books down the series path.
	it("treats a missing series id as standalone", () => {
		const works = rollUpWorks([
			book({ bookId: "a", seriesId: undefined as unknown as null }),
			book({ bookId: "b", seriesId: "" }),
		]);
		expect(works.every((w) => !w.isSeries)).toBe(true);
		expect(works.map((w) => w.workId).sort()).toEqual(["a", "b"]);
	});

	it("returns nothing for no rows", () => {
		expect(rollUpWorks([])).toEqual([]);
	});
});

describe("isMeasurableSitting", () => {
	const sitting = { wordsRead: 1700, durationMs: minutes(10) };

	it("measures every reading mode but never listening", () => {
		expect(isMeasurableSitting({ ...sitting, mode: "scroll" })).toBe(true);
		expect(isMeasurableSitting({ ...sitting, mode: "rsvp" })).toBe(true);
		expect(isMeasurableSitting({ ...sitting, mode: "listen" })).toBe(false);
	});
});
