import { describe, expect, test } from "vitest";
import { previousDayKey, streakFromDays } from "../streak";

const days = (...entries: [string, number][]) => new Map(entries);

describe("streakFromDays", () => {
	test("counts back from today, or from yesterday when today has no reading yet", () => {
		const read = days(["2026-06-13", 5], ["2026-06-14", 5], ["2026-06-15", 5]);
		expect(streakFromDays(read, "2026-06-15")).toEqual({ current: 3, longest: 3 });
		expect(streakFromDays(read, "2026-06-16")).toEqual({ current: 3, longest: 3 });
		expect(streakFromDays(read, "2026-06-17")).toEqual({ current: 0, longest: 3 });
	});

	test("days below the threshold break a run, and the longest run is kept", () => {
		const read = days(
			["2026-01-01", 5],
			["2026-01-02", 5],
			["2026-01-03", 5],
			["2026-01-04", 0.5],
			["2026-01-05", 5],
		);
		expect(streakFromDays(read, "2026-01-05")).toEqual({ current: 1, longest: 3 });
	});

	test("previousDayKey crosses months, years and leap days", () => {
		expect(previousDayKey("2026-03-01")).toBe("2026-02-28");
		expect(previousDayKey("2024-03-01")).toBe("2024-02-29");
		expect(previousDayKey("2026-01-01")).toBe("2025-12-31");
	});
});
