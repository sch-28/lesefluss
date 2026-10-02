import { describe, expect, test } from "vitest";
import { previousDayKey, readingDayKeys, streakFromDays } from "../streak";

/** Consecutive day keys from `start`, `count` long. */
function run(start: string, count: number): string[] {
	const first = Date.parse(`${start}T00:00:00Z`);
	return Array.from({ length: count }, (_, i) =>
		new Date(first + i * 86_400_000).toISOString().slice(0, 10),
	);
}

const daysOf = (...groups: string[][]) => new Set(groups.flat());

describe("streakFromDays", () => {
	test("counts back from today, or from yesterday when today has no reading yet", () => {
		const read = daysOf(run("2026-06-13", 3));
		expect(streakFromDays(read, "2026-06-15")).toMatchObject({ current: 3, longest: 3 });
		expect(streakFromDays(read, "2026-06-16")).toMatchObject({ current: 3, longest: 3 });
		expect(streakFromDays(read, "2026-06-17")).toMatchObject({ current: 0, longest: 3 });
	});

	test("a missed day without a banked freeze breaks the run, and the longest run is kept", () => {
		const read = daysOf(run("2026-01-01", 3), ["2026-01-05"]);
		expect(streakFromDays(read, "2026-01-05")).toEqual({
			current: 1,
			longest: 3,
			frozenDays: [],
			freezesBanked: 0,
		});
	});

	test("seven read days earn a freeze that covers the next missed day", () => {
		const read = daysOf(run("2026-03-01", 7), run("2026-03-09", 2));
		expect(streakFromDays(read, "2026-03-10")).toEqual({
			current: 10,
			longest: 10,
			frozenDays: ["2026-03-08"],
			freezesBanked: 0,
		});
	});

	test("six read days are not enough for a freeze", () => {
		const read = daysOf(run("2026-03-01", 6), run("2026-03-08", 2));
		expect(streakFromDays(read, "2026-03-09")).toMatchObject({ current: 2, frozenDays: [] });
	});

	test("banks at most two freezes", () => {
		const read = daysOf(run("2026-03-01", 21));
		expect(streakFromDays(read, "2026-03-21").freezesBanked).toBe(2);

		const withGap = daysOf(run("2026-03-01", 21), ["2026-03-24"]);
		expect(streakFromDays(withGap, "2026-03-24")).toMatchObject({
			current: 24,
			frozenDays: ["2026-03-22", "2026-03-23"],
			freezesBanked: 0,
		});
	});

	test("a freeze keeps the streak alive over a missed yesterday, counted once reading resumes", () => {
		const read = daysOf(run("2026-03-01", 7));
		expect(streakFromDays(read, "2026-03-09")).toEqual({
			current: 7,
			longest: 7,
			frozenDays: ["2026-03-08"],
			freezesBanked: 0,
		});
		expect(streakFromDays(daysOf(run("2026-03-01", 7), ["2026-03-09"]), "2026-03-09")).toEqual({
			current: 9,
			longest: 9,
			frozenDays: ["2026-03-08"],
			freezesBanked: 0,
		});
	});

	test("the best streak never shrinks while freezes run out", () => {
		const read = daysOf(run("2026-03-01", 14));
		expect(streakFromDays(read, "2026-03-17")).toMatchObject({ current: 14, longest: 14 });
		expect(streakFromDays(read, "2026-03-18")).toMatchObject({ current: 0, longest: 14 });
	});

	test("a gap longer than the banked freezes spends none and leaves no frozen days", () => {
		const read = daysOf(run("2026-03-01", 14), ["2026-03-20"]);
		expect(streakFromDays(read, "2026-03-20")).toEqual({
			current: 1,
			longest: 14,
			frozenDays: [],
			freezesBanked: 0,
		});
		expect(streakFromDays(daysOf(run("2026-03-01", 14)), "2026-03-18").frozenDays).toEqual([]);
	});

	test("a break resets progress toward the next freeze", () => {
		const read = daysOf(run("2026-03-01", 4), run("2026-03-06", 4), ["2026-03-11"]);
		expect(streakFromDays(read, "2026-03-11")).toMatchObject({ current: 1, frozenDays: [] });
	});

	test("yesterday is not missed while its late-night window is still open", () => {
		const read = daysOf(run("2026-03-01", 3));
		expect(streakFromDays(read, "2026-03-05", "2026-03-04")).toMatchObject({ current: 3 });
		expect(streakFromDays(read, "2026-03-05")).toMatchObject({ current: 0 });
	});

	test("ignores keys that are not four-digit-year dates", () => {
		const read = daysOf(run("2026-03-01", 2), ["10000-01-01", "+010000-01", "", "garbage"]);
		expect(streakFromDays(read, "2026-03-02")).toMatchObject({ current: 2, longest: 2 });
	});

	test("ignores read days after today", () => {
		const read = daysOf(run("2026-03-01", 2), ["2026-04-01"]);
		expect(streakFromDays(read, "2026-03-02")).toMatchObject({ current: 2, longest: 2 });
	});

	test("no reading at all is no streak", () => {
		expect(streakFromDays(new Set(), "2026-03-11")).toEqual({
			current: 0,
			longest: 0,
			frozenDays: [],
			freezesBanked: 0,
		});
	});
});

describe("readingDayKeys", () => {
	test("counts the small hours for the previous day as well", () => {
		expect(readingDayKeys("2026-03-01", 0)).toEqual(["2026-02-28", "2026-03-01"]);
		expect(readingDayKeys("2026-03-01", 3)).toEqual(["2026-02-28", "2026-03-01"]);
		expect(readingDayKeys("2026-03-01", 4)).toEqual(["2026-03-01"]);
		expect(readingDayKeys("2026-03-01", 23)).toEqual(["2026-03-01"]);
	});
});

describe("day keys", () => {
	test("previousDayKey crosses months, years and leap days", () => {
		expect(previousDayKey("2026-03-01")).toBe("2026-02-28");
		expect(previousDayKey("2024-03-01")).toBe("2024-02-29");
		expect(previousDayKey("2026-01-01")).toBe("2025-12-31");
	});
});
