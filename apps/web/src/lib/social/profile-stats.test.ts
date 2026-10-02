import { describe, expect, it } from "vitest";
import { readingDaysOf } from "./profile-stats";

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
