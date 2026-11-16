import { describe, expect, it } from "vitest";
import { formatAgo, formatDate, formatDayKey, formatDuration, formatRelative } from "../date-utils";

describe("formatAgo", () => {
	const now = new Date(2026, 8, 27, 3, 0).getTime();
	const MIN = 60_000;

	it("counts minutes and hours within the last day", () => {
		expect(formatAgo(now - 59_000, now)).toBe("just now");
		expect(formatAgo(now - 61_000, now)).toBe("1 min ago");
		expect(formatAgo(now - 59 * MIN, now)).toBe("59 min ago");
		// Three hours ago is the previous calendar day here, which formatRelative calls "yesterday".
		expect(formatAgo(now - 180 * MIN, now)).toBe("3 h ago");
		expect(formatAgo(now - (24 * 60 - 1) * MIN, now)).toBe("23 h ago");
	});

	it("falls back to the calendar wording after a day", () => {
		const twoDays = now - 2 * 24 * 60 * MIN;
		expect(formatAgo(twoDays, now)).toBe(formatRelative(twoDays, now));
	});
});

describe("formatDate", () => {
	const now = new Date(2026, 10, 16, 12).getTime();

	it("renders nothing for a missing time instead of throwing", () => {
		expect(formatDate(Number.NaN, now)).toBe("");
		expect(formatRelative(Number.NaN, now)).toBe("");
	});

	it("is one short form, with the year only outside the current one", () => {
		expect(formatDate(new Date(2026, 7, 25).getTime(), now)).toBe("Aug 25");
		expect(formatDate(new Date(2025, 7, 25).getTime(), now)).toBe("Aug 25, 2025");
		expect(formatDayKey("2026-11-29", now)).toBe("Nov 29");
		expect(formatDayKey("not-a-day", now)).toBe("not-a-day");
	});

	it("is what formatRelative falls back to past 60 days", () => {
		const old = new Date(2026, 6, 1).getTime();
		expect(formatRelative(old, now)).toBe("Jul 1");
		expect(formatRelative(now - 14 * 86_400_000, now)).toBe("2w ago");
	});
});

describe("formatDuration", () => {
	it("is one form for every length", () => {
		expect(formatDuration(-5)).toBe("0 min");
		expect(formatDuration(59_999)).toBe("0 min");
		expect(formatDuration(15 * 60_000)).toBe("15 min");
		expect(formatDuration(60 * 60_000)).toBe("1h");
		expect(formatDuration((12 * 60 + 41) * 60_000)).toBe("12h 41m");
	});
});
