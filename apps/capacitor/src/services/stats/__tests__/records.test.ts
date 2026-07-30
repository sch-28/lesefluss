import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RecordBook, RecordSession } from "../records";
import { summariseRecords } from "../records";

const ORIGINAL_TZ = process.env.TZ;
beforeAll(() => {
	process.env.TZ = "Europe/Berlin";
});
afterAll(() => {
	process.env.TZ = ORIGINAL_TZ;
});

const MINUTE = 60_000;

function at(y: number, m: number, d: number, h = 12): number {
	return new Date(y, m - 1, d, h).getTime();
}

function session(overrides: Partial<RecordSession> = {}): RecordSession {
	return {
		bookId: "a",
		startedAt: at(2026, 5, 10),
		durationMs: 30 * MINUTE,
		wordsRead: 9000,
		...overrides,
	};
}

function book(overrides: Partial<RecordBook> = {}): RecordBook {
	return {
		id: "a",
		title: "A Book",
		wordCount: 100_000,
		finishedAt: null,
		seriesId: null,
		...overrides,
	};
}

describe("summariseRecords", () => {
	it("returns nothing rather than zeroes when there is no reading", () => {
		expect(summariseRecords([], [])).toEqual({
			longestSitting: null,
			bestDay: null,
			fastestBook: null,
			longestBookFinished: null,
		});
	});

	it("names the longest sitting and the book it was in", () => {
		const records = summariseRecords(
			[
				session({ durationMs: 20 * MINUTE }),
				session({ bookId: "b", durationMs: 90 * MINUTE, startedAt: at(2026, 5, 12) }),
				session({ durationMs: 45 * MINUTE }),
			],
			[book(), book({ id: "b", title: "The Long One" })],
		);
		expect(records.longestSitting).toEqual({
			durationMs: 90 * MINUTE,
			at: at(2026, 5, 12),
			title: "The Long One",
		});
	});

	// Several sittings on one day have to add up, or "best day" is just a
	// second name for "longest sitting".
	it("sums a day's sittings for the best day", () => {
		const records = summariseRecords(
			[
				session({ startedAt: at(2026, 5, 10, 9), durationMs: 40 * MINUTE }),
				session({ startedAt: at(2026, 5, 10, 21), durationMs: 50 * MINUTE }),
				session({ startedAt: at(2026, 5, 11, 12), durationMs: 80 * MINUTE }),
			],
			[book()],
		);
		expect(records.bestDay).toEqual({ durationMs: 90 * MINUTE, dayStart: at(2026, 5, 10, 0) });
	});

	// Berlin is UTC+2 in May, so 00:30 local is the *previous* day in UTC. Two
	// sittings on one local day must still add up; grouping by UTC would split
	// them and report the larger one alone.
	it("groups a day by local time, not UTC", () => {
		const records = summariseRecords(
			[
				session({ startedAt: at(2026, 5, 10, 0) + 30 * MINUTE, durationMs: 40 * MINUTE }),
				session({ startedAt: at(2026, 5, 10, 12), durationMs: 50 * MINUTE }),
			],
			[book()],
		);
		expect(records.bestDay).toEqual({ durationMs: 90 * MINUTE, dayStart: at(2026, 5, 10, 0) });
	});

	it("picks the faster of two books", () => {
		const records = summariseRecords(
			[
				session({ bookId: "slow", durationMs: 60 * MINUTE, wordsRead: 12_000 }),
				session({ bookId: "fast", durationMs: 60 * MINUTE, wordsRead: 24_000 }),
			],
			[book({ id: "slow", title: "Slow" }), book({ id: "fast", title: "Fast" })],
		);
		expect(records.fastestBook).toEqual({ wpm: 400, title: "Fast" });
	});

	// One book, two sittings at different paces. Taking the last sitting instead
	// of accumulating would give 180; averaging the two rates would give 240.
	it("weights a book's speed by words across all its sittings", () => {
		const records = summariseRecords(
			[
				session({ bookId: "a", durationMs: 10 * MINUTE, wordsRead: 3_000 }),
				session({ bookId: "a", durationMs: 50 * MINUTE, wordsRead: 9_000 }),
			],
			[book({ id: "a", title: "One Book" })],
		);
		expect(records.fastestBook).toEqual({ wpm: 200, title: "One Book" });
	});

	// Ties must not depend on row order: sessions arrive sorted by startedAt, so
	// the earliest record-setting sitting keeps the crown.
	it("keeps the earliest of two equally long sittings", () => {
		const records = summariseRecords(
			[
				session({ bookId: "first", startedAt: at(2026, 5, 1), durationMs: 60 * MINUTE }),
				session({ bookId: "second", startedAt: at(2026, 5, 9), durationMs: 60 * MINUTE }),
			],
			[book({ id: "first", title: "First" }), book({ id: "second", title: "Second" })],
		);
		expect(records.longestSitting?.title).toBe("First");
	});

	it("ignores zero-duration sittings", () => {
		const records = summariseRecords([session({ durationMs: 0, wordsRead: 0 })], [book()]);
		expect(records.longestSitting).toBeNull();
		expect(records.bestDay).toBeNull();
	});

	// A serial chapter is a books row. Forty finished chapters is one book, and
	// the Finished shelf above the card already excludes them.
	it("does not let a finished serial chapter be the longest book", () => {
		const records = summariseRecords(
			[session()],
			[
				// Deliberately the longer of the two: with the filter dropped this
				// chapter would take the record, which is the regression to catch.
				book({
					id: "ch",
					title: "Chapter 12",
					wordCount: 300_000,
					finishedAt: at(2026, 5, 1),
					seriesId: "s1",
				}),
				book({ id: "real", title: "A Novel", wordCount: 90_000, finishedAt: at(2026, 5, 2) }),
			],
		);
		expect(records.longestBookFinished).toEqual({ words: 90_000, title: "A Novel" });
	});

	// Sync can copy a server `finishedAt` onto a chapter row that has no content
	// yet, so a finished book with zero words is reachable.
	it("ignores a finished book with no word count", () => {
		const records = summariseRecords(
			[session()],
			[book({ id: "empty", title: "Pending", wordCount: 0, finishedAt: at(2026, 5, 1) })],
		);
		expect(records.longestBookFinished).toBeNull();
	});

	// A position jump reads as thousands of words per minute. Without the gate it
	// would hold the speed record permanently.
	it("ignores an implausible sitting when crowning the fastest book", () => {
		const records = summariseRecords(
			[
				session({ bookId: "real", durationMs: 60 * MINUTE, wordsRead: 18_000 }),
				session({ bookId: "jump", durationMs: 27_000, wordsRead: 22_488 }),
				session({ bookId: "jump", durationMs: 30 * MINUTE, wordsRead: 3_000 }),
			],
			[book({ id: "real", title: "Real" }), book({ id: "jump", title: "Jumped" })],
		);
		expect(records.fastestBook?.title).toBe("Real");
	});

	// One fast minute is noise. The record should describe a pace, not a moment.
	it("requires meaningful reading time before a book can hold the speed record", () => {
		const records = summariseRecords(
			[
				session({ bookId: "brief", durationMs: 2 * MINUTE, wordsRead: 1_400 }),
				session({ bookId: "real", durationMs: 60 * MINUTE, wordsRead: 18_000 }),
			],
			[book({ id: "brief", title: "Brief" }), book({ id: "real", title: "Real" })],
		);
		expect(records.fastestBook?.title).toBe("Real");
	});

	it("counts only finished books for the longest finished", () => {
		const records = summariseRecords(
			[session()],
			[
				book({ id: "huge", title: "Huge Unfinished", wordCount: 900_000, finishedAt: null }),
				book({ id: "done", title: "Done", wordCount: 250_000, finishedAt: at(2026, 5, 1) }),
			],
		);
		expect(records.longestBookFinished).toEqual({ words: 250_000, title: "Done" });
	});

	// Deleting a book leaves its sessions behind. Real data crowned a deleted
	// book "fastest read" and rendered it as the placeholder "a book".
	it("does not let a deleted book hold a record it cannot name", () => {
		const records = summariseRecords(
			[
				session({ bookId: "ghost", durationMs: 120 * MINUTE, wordsRead: 60_000 }),
				session({ bookId: "a", durationMs: 60 * MINUTE, wordsRead: 18_000 }),
			],
			[book({ id: "a", title: "Real" })],
		);
		expect(records.longestSitting?.title).toBe("Real");
		expect(records.fastestBook?.title).toBe("Real");
		// The time was still spent, so the day total keeps it.
		expect(records.bestDay?.durationMs).toBe(180 * MINUTE);
	});
});
