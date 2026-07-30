import { describe, expect, it } from "vitest";
import { AVERAGE_READER_WPM } from "../../../utils/reading-time";
import { summariseBookReading } from "../book-summary";

function book(overrides: Partial<Parameters<typeof summariseBookReading>[0]> = {}) {
	return {
		seriesId: null,
		wordCount: 100_000,
		wordPosition: 50_000,
		finishedAt: null,
		...overrides,
	};
}

describe("summariseBookReading", () => {
	it("estimates the time left at the reader's own measured pace", () => {
		const s = summariseBookReading(book(), 500);
		expect(s.minutesLeft).toBe(100); // 50k words left at 500 wpm
		expect(s.paceWpm).toBe(500);
		expect(s.isPaceEstimated).toBe(false);
	});

	it("falls back to the generic pace, and says so", () => {
		const s = summariseBookReading(book(), null);
		expect(s.paceWpm).toBe(AVERAGE_READER_WPM);
		expect(s.isPaceEstimated).toBe(true);
		expect(s.minutesLeft).toBe(50_000 / AVERAGE_READER_WPM);
	});

	// A book with a single very short sitting can round to 0 wpm, which would
	// divide the remaining words by zero and render Infinity.
	it("treats a measured pace of zero as no measurement", () => {
		const s = summariseBookReading(book(), 0);
		expect(s.paceWpm).toBe(AVERAGE_READER_WPM);
		expect(s.isPaceEstimated).toBe(true);
		expect(Number.isFinite(s.minutesLeft as number)).toBe(true);
	});

	it("reports no time left once the book counts as finished", () => {
		const s = summariseBookReading(book({ wordPosition: 95_000, finishedAt: 1_700_000 }), 300);
		expect(s.isFinished).toBe(true);
		expect(s.minutesLeft).toBeNull();
	});

	// `finished_at` is only ever set, never cleared. Recomputing from position
	// would unfinish a book the reader reopened and scrolled back in, while the
	// finished date still rendered beside it.
	it("keeps a reopened book finished even after the reader scrolls back", () => {
		const s = summariseBookReading(book({ wordPosition: 1000, finishedAt: 1_700_000 }), 300);
		expect(s.percent).toBe(1);
		expect(s.isFinished).toBe(true);
		expect(s.minutesLeft).toBeNull();
	});

	// The stamp uses an unrounded threshold, so a book whose percent rounds up to
	// 95 is not finished until the database says so.
	it("does not call a book finished just because its percent rounds to 95", () => {
		const s = summariseBookReading(book({ wordCount: 10_000, wordPosition: 9460 }), 300);
		expect(s.percent).toBe(95);
		expect(s.isFinished).toBe(false);
		expect(s.minutesLeft).not.toBeNull();
	});

	it("never reports a page past the last one", () => {
		// A re-import or a synced position can leave the reader past the end.
		const s = summariseBookReading(book({ wordCount: 1000, wordPosition: 1200 }), 300);
		expect(s.totalPages).toBe(4);
		expect(s.pagesIn).toBe(4);
		expect(s.percent).toBe(100);
	});

	it("suppresses the page count for a serial chapter", () => {
		const s = summariseBookReading(book({ seriesId: "s1" }), 300);
		expect(s.totalPages).toBeNull();
		expect(s.pagesIn).toBe(0);
		// Progress itself still means something for the chapter.
		expect(s.percent).toBe(50);
	});

	it("reports nothing derived from length when the length is unknown", () => {
		const s = summariseBookReading(book({ wordCount: 0, wordPosition: 0 }), 300);
		expect(s.totalPages).toBeNull();
		expect(s.percent).toBe(0);
		expect(s.isFinished).toBe(false);
		expect(s.minutesLeft).toBeNull();
	});
});
