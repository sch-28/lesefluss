import { describe, expect, it } from "vitest";
import {
	isMeasurableSitting,
	isSkimmedSitting,
	rollUpWorks,
	SKIM_MAX_READING_WPM,
	skimCutoffs,
	speedSittings,
} from "../reading-rates";

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

describe("skimmed sittings", () => {
	const MIN = 60_000;
	const sitting = (mode: "scroll" | "page" | "rsvp" | "listen", wpm: number) => ({
		mode,
		wordsRead: wpm * 10,
		durationMs: 10 * MIN,
	});

	it("caps scroll and page at 600 wpm while there is no median yet", () => {
		const rows = [sitting("scroll", 250), sitting("page", 620)];
		const cutoff = skimCutoffs(rows);
		expect(cutoff.reading).toBe(SKIM_MAX_READING_WPM);
		expect(isSkimmedSitting(rows[1], cutoff)).toBe(true);
		expect(isSkimmedSitting(rows[0], cutoff)).toBe(false);
	});

	it("skims a sitting over 1.6x the reader's own median", () => {
		const rows = [200, 210, 220, 230, 240, 400].map((wpm) => sitting("scroll", wpm));
		const cutoff = skimCutoffs(rows);
		expect(cutoff.reading).toBeCloseTo(225 * 1.6);
		expect(speedSittings(rows).map((r) => r.wordsRead / 10)).toEqual([200, 210, 220, 230, 240]);
	});

	it("does not hold RSVP to the reading cap, nor skim it before it has a median", () => {
		const rows = [sitting("scroll", 250), sitting("rsvp", 900)];
		expect(isSkimmedSitting(rows[1], skimCutoffs(rows))).toBe(false);
		expect(speedSittings(rows)).toHaveLength(2);
	});

	it("skims an RSVP sitting over 1.6x the reader's own RSVP median", () => {
		const rows = [400, 420, 450, 480, 500, 1200].map((wpm) => sitting("rsvp", wpm));
		const cutoff = skimCutoffs(rows);
		expect(cutoff.rsvp).toBeCloseTo(465 * 1.6);
		expect(isSkimmedSitting(rows[5], cutoff)).toBe(true);
		expect(speedSittings(rows).map((r) => r.wordsRead / 10)).toEqual([400, 420, 450, 480, 500]);
	});

	it("judges scroll against reading sittings only, never against RSVP's faster pace", () => {
		const rows = [
			...[200, 210, 220, 230, 240].map((wpm) => sitting("scroll", wpm)),
			...[500, 520, 540, 560, 580].map((wpm) => sitting("rsvp", wpm)),
		];
		const cutoff = skimCutoffs(rows);
		expect(isSkimmedSitting(sitting("scroll", 400), cutoff)).toBe(true);
		expect(isSkimmedSitting(sitting("rsvp", 600), cutoff)).toBe(false);
	});

	it("leaves listening and implausible rows out of speed as before", () => {
		expect(speedSittings([sitting("listen", 200), sitting("scroll", 3000)])).toEqual([]);
	});
});
