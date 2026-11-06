import { computeSpeedModel, type SpeedRow } from "@lesefluss/core";
import { describe, expect, it } from "vitest";
import { profileSpeeds, readingDaysOf } from "./profile-stats";

const NOW = Date.UTC(2026, 10, 6);
const MIN = 60_000;

function sitting(mode: SpeedRow["mode"], minutes: number, wpm: number, daysAgo = 1): SpeedRow {
	return {
		mode,
		startedAt: NOW - daysAgo * 86_400_000,
		durationMs: minutes * MIN,
		wordsRead: minutes * wpm,
		wpmAvg: mode === "rsvp" ? Math.round(wpm / 0.7) : null,
	};
}

const speedsOf = (rows: SpeedRow[]) => profileSpeeds(computeSpeedModel(rows, { now: NOW }));

describe("profileSpeeds", () => {
	it("gives a reader of both modes both speeds, apart", () => {
		expect(speedsOf([sitting("scroll", 30, 250), sitting("rsvp", 30, 420)])).toEqual({
			reading: 250,
			rsvp: 420,
		});
	});

	it("gives a single-mode reader that mode only", () => {
		expect(speedsOf([sitting("rsvp", 30, 420)])).toEqual({ rsvp: 420 });
		expect(speedsOf([sitting("page", 30, 240)])).toEqual({ reading: 240 });
	});

	it("leaves out a mode read too briefly to be theirs", () => {
		expect(speedsOf([sitting("scroll", 30, 250), sitting("rsvp", 3, 420)])).toEqual({
			reading: 250,
		});
		expect(speedsOf([])).toEqual({});
	});

	it("uses the recent window, like the owner's own chip", () => {
		// 12h of old slow reading, then 10h of faster: the recent window sees only the newer.
		const old = Array.from({ length: 12 }, (_, i) => sitting("scroll", 60, 200, 40 + i));
		const recent = Array.from({ length: 10 }, (_, i) => sitting("scroll", 60, 300, 1 + i));
		expect(speedsOf([...old, ...recent])).toEqual({ reading: 300 });
	});
});

describe("readingDaysOf", () => {
	it("counts a sitting before 04:00 in the owner's zone for the previous day too", () => {
		// 01:30 in Berlin (UTC+2) is 23:30 UTC the evening before.
		expect(readingDaysOf(new Date("2026-05-10T23:30:00Z"), "Europe/Berlin")).toEqual([
			"2026-05-10",
			"2026-05-11",
		]);
		expect(readingDaysOf(new Date("2026-05-11T02:30:00Z"), "Europe/Berlin")).toEqual([
			"2026-05-11",
		]);
	});

	it("falls back to UTC without a zone", () => {
		expect(readingDaysOf(new Date("2026-05-11T03:59:00Z"), undefined)).toEqual([
			"2026-05-10",
			"2026-05-11",
		]);
		expect(readingDaysOf(new Date("2026-05-11T04:00:00Z"), undefined)).toEqual(["2026-05-11"]);
	});

	// Some Intl implementations render midnight as hour "24" without hourCycle h23.
	it("treats midnight as the small hours, not hour 24", () => {
		expect(readingDaysOf(new Date("2026-05-11T00:00:00Z"), undefined)).toEqual([
			"2026-05-10",
			"2026-05-11",
		]);
	});
});
