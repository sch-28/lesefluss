import { describe, expect, it } from "vitest";
import {
	measuredReadingSpeed,
	type RateSession,
	rollUpWorks,
	summariseReadingRates,
} from "../reading-rates";

const minutes = (n: number) => n * 60_000;

describe("summariseReadingRates", () => {
	function rsvp(overrides: Partial<RateSession> = {}): RateSession {
		return {
			mode: "rsvp",
			wpmAvg: 400,
			wordsRead: 2600,
			durationMs: minutes(10),
			...overrides,
		};
	}

	// The engine spends time on punctuation pauses and the accel ramp, so
	// estimating from the dial alone runs short by roughly this much.
	it("reports delivered as a fraction of the dial", () => {
		const rates = summariseReadingRates([rsvp()]);
		expect(rates.rsvpDeliveredRatio).toBeCloseTo(260 / 400, 5);
	});

	// Both halves must come from the same rows. Counting a dial-less session's
	// words as delivered while excluding it from the target divides one
	// population by another.
	it("ignores rsvp sessions with no recorded dial", () => {
		const withDial = summariseReadingRates([rsvp()]);
		const withExtra = summariseReadingRates([
			rsvp(),
			rsvp({ wpmAvg: null, wordsRead: 9000, durationMs: minutes(10) }),
		]);
		expect(withExtra.rsvpDeliveredRatio).toBe(withDial.rsvpDeliveredRatio);
	});

	it("has no ratio without rsvp history", () => {
		const rates = summariseReadingRates([
			{ mode: "scroll", wpmAvg: 240, wordsRead: 2400, durationMs: minutes(10) },
		]);
		expect(rates.rsvpDeliveredRatio).toBeNull();
		expect(rates.scrollWpm).toBe(240);
	});

	it("keeps scroll and page apart", () => {
		const rates = summariseReadingRates([
			{ mode: "scroll", wpmAvg: null, wordsRead: 3000, durationMs: minutes(10) },
			{ mode: "page", wpmAvg: null, wordsRead: 1000, durationMs: minutes(10) },
		]);
		expect(rates.scrollWpm).toBe(300);
		expect(rates.pageWpm).toBe(100);
	});

	// One glanced-at paragraph should not move an estimate built from hours.
	it("weights by words, not by session", () => {
		const rates = summariseReadingRates([
			{ mode: "scroll", wpmAvg: null, wordsRead: 30_000, durationMs: minutes(100) },
			{ mode: "scroll", wpmAvg: null, wordsRead: 20, durationMs: minutes(2) },
		]);
		expect(rates.scrollWpm).toBe(294);
	});

	it("ignores sittings too short to measure", () => {
		const rates = summariseReadingRates([
			{ mode: "scroll", wpmAvg: null, wordsRead: 5, durationMs: 500 },
		]);
		expect(rates.scrollWpm).toBeNull();
	});

	it("returns nulls for no history at all", () => {
		expect(summariseReadingRates([])).toEqual({
			rsvpDeliveredRatio: null,
			scrollWpm: null,
			pageWpm: null,
		});
	});
});

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

describe("measuredReadingSpeed", () => {
	it("is words over active time across plausible sittings, any mode", () => {
		expect(
			measuredReadingSpeed([
				{ wordsRead: 3000, durationMs: minutes(10) },
				{ wordsRead: 1000, durationMs: minutes(10) },
			]),
		).toBe(200);
	});

	it("drops position jumps and unmeasurable sittings", () => {
		expect(
			measuredReadingSpeed([
				{ wordsRead: 3000, durationMs: minutes(10) },
				{ wordsRead: 22_488, durationMs: 27_000 },
				{ wordsRead: 5, durationMs: 500 },
			]),
		).toBe(300);
	});

	it("is null with nothing to measure", () => {
		expect(measuredReadingSpeed([])).toBeNull();
		expect(measuredReadingSpeed([{ wordsRead: 22_488, durationMs: 27_000 }])).toBeNull();
	});
});
