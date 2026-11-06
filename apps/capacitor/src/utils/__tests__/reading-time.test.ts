import { describe, expect, it } from "vitest";
import { estimateMinutesLeft, minutesLabel } from "../reading-time";

describe("minutesLabel", () => {
	it("shows an estimate as a plain value", () => {
		expect(minutesLabel(10)).toBe("10 min");
		expect(minutesLabel(65)).toBe("1h 5m");
		expect(minutesLabel(0.5)).toBe("< 1 min");
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
