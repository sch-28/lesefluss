import { describe, expect, it } from "vitest";
import {
	averageDailyMinutes,
	finishDayAt,
	seriesReadingTime,
	WHAT_IF_WPM,
	whatIfEstimate,
	whatIfStart,
} from "../what-if";

const MIN = 60_000;

describe("whatIfStart", () => {
	it("snaps the pace onto the slider's steps and range", () => {
		expect(whatIfStart(238)).toBe(250);
		expect(whatIfStart(40)).toBe(WHAT_IF_WPM.min);
		expect(whatIfStart(4000)).toBe(WHAT_IF_WPM.max);
	});
});

describe("averageDailyMinutes", () => {
	it("averages over the days since the first reading day in the window, idle days included", () => {
		const days = new Map([
			["2026-03-08", 30 * MIN],
			["2026-03-10", 10 * MIN],
		]);
		expect(averageDailyMinutes(days, "2026-03-10")).toBeCloseTo(40 / 3);
	});

	it("caps the span at 30 days and ignores older reading", () => {
		const days = new Map([
			["2026-02-08", 600 * MIN],
			["2026-02-09", 60 * MIN],
			["2026-03-10", 30 * MIN],
		]);
		expect(averageDailyMinutes(days, "2026-03-10")).toBeCloseTo(90 / 30);
	});

	it("is null with no reading in the window", () => {
		expect(averageDailyMinutes(new Map([["2026-01-01", 5 * MIN]]), "2026-03-10")).toBeNull();
		expect(averageDailyMinutes(new Map(), "2026-03-10")).toBeNull();
	});
});

describe("finishDayAt", () => {
	it("counts today as the first reading day", () => {
		expect(finishDayAt(20, 20, "2026-03-10")).toBe("2026-03-10");
		expect(finishDayAt(21, 20, "2026-03-10")).toBe("2026-03-11");
		expect(finishDayAt(0, 20, "2026-03-10")).toBe("2026-03-10");
	});
});

describe("whatIfEstimate", () => {
	it("moves time left and finish day with the speed", () => {
		const slow = whatIfEstimate(30_000, 250, 30, "2026-03-10");
		const fast = whatIfEstimate(30_000, 500, 30, "2026-03-10");
		expect(slow).toEqual({ minutesLeft: 120, finishDay: "2026-03-13" });
		expect(fast).toEqual({ minutesLeft: 60, finishDay: "2026-03-11" });
	});

	it("has no finish day without a daily reading time", () => {
		expect(whatIfEstimate(30_000, 250, null, "2026-03-10").finishDay).toBeNull();
		expect(whatIfEstimate(30_000, 250, 0, "2026-03-10").finishDay).toBeNull();
	});
});

describe("seriesReadingTime", () => {
	it("sums known chapters, counts what is left, and counts unfetched ones apart", () => {
		expect(
			seriesReadingTime([
				{ wordCount: 1000, wordPosition: 1000, finishedAt: 1 },
				{ wordCount: 2000, wordPosition: 500, finishedAt: null },
				{ wordCount: 3000, wordPosition: 0, finishedAt: null },
				{ wordCount: 0, wordPosition: 0, finishedAt: null },
			]),
		).toEqual({ words: 6000, wordsLeft: 4500, unknown: 1 });
	});

	it("leaves nothing of a finished chapter whose position stopped short", () => {
		expect(
			seriesReadingTime([{ wordCount: 1000, wordPosition: 990, finishedAt: 1 }]).wordsLeft,
		).toBe(0);
	});
});
