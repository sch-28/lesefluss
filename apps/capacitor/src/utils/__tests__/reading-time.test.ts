import { describe, expect, it } from "vitest";
import { formatDuration } from "../date-utils";
import { estimateMinutesLeft, formatReadingTime, formatTimeLeft } from "../reading-time";

describe("formatReadingTime", () => {
	it("shows an estimate in the one duration format, rounded", () => {
		expect(formatReadingTime(10)).toBe("10 min");
		expect(formatReadingTime(14.6)).toBe("15 min");
		expect(formatReadingTime(65)).toBe("1h 5m");
		expect(formatReadingTime(761)).toBe(formatDuration(761 * 60_000));
		expect(formatReadingTime(0.5)).toBe("< 1 min");
	});
});

describe("formatTimeLeft", () => {
	it("puts the unit first and 'left' last", () => {
		expect(formatTimeLeft(39)).toBe("39 min left");
		expect(formatTimeLeft(480)).toBe("8h left");
	});
});

describe("estimateMinutesLeft", () => {
	const book = { wordCount: 10_000, wordPosition: 4000, finishedAt: null };

	it("is the words left at the pace", () => {
		expect(estimateMinutesLeft(book, 300)).toBe(20);
	});

	it("is null for a finished book or an unknown length", () => {
		expect(estimateMinutesLeft({ ...book, finishedAt: 1 }, 300)).toBeNull();
		expect(estimateMinutesLeft({ ...book, wordCount: 0 }, 300)).toBeNull();
	});

	it("never goes below zero past the last word", () => {
		expect(estimateMinutesLeft({ ...book, wordPosition: 12_000 }, 300)).toBe(0);
	});
});
