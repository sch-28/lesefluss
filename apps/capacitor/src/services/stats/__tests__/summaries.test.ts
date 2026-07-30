import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SpeedBucket, WpmTrend } from "../aggregate";
import type { CalendarDay } from "../calendar";
import {
	summariseHours,
	summariseMonth,
	summariseSpeedBuckets,
	summariseWpmTrend,
} from "../summaries";

const ORIGINAL_TZ = process.env.TZ;
beforeAll(() => {
	process.env.TZ = "Europe/Berlin";
});
afterAll(() => {
	process.env.TZ = ORIGINAL_TZ;
});

describe("summariseMonth", () => {
	function calDay(dateKey: string, minutes: number, isInMonth = true): CalendarDay {
		const [y, m, d] = dateKey.split("-").map(Number);
		const dayStart = new Date(y as number, (m as number) - 1, d).getTime();
		return {
			dateKey,
			dayStart,
			durationMs: minutes * 60_000,
			isInMonth,
			intensity: minutes > 0 ? 1 : 0,
			linksBefore: false,
			linksAfter: false,
		};
	}

	it("counts days read against the days in the month", () => {
		const summary = summariseMonth(
			[calDay("2026-05-01", 30), calDay("2026-05-02", 0), calDay("2026-05-03", 90)],
			"May",
		);
		expect(summary).toContain("read on 2 of 3 days");
		expect(summary).toContain("2h");
		expect(summary).toContain("May 3");
	});

	// The grid pads to whole weeks, so the denominator must ignore the padding or
	// a 31-day month reports "of 35 days".
	it("ignores the padding days from adjacent months", () => {
		const summary = summariseMonth(
			[
				calDay("2026-04-27", 60, false),
				calDay("2026-05-01", 30),
				calDay("2026-05-02", 0),
				calDay("2026-06-01", 60, false),
			],
			"May",
		);
		expect(summary).toContain("read on 1 of 2 days");
		expect(summary).not.toContain("April");
	});

	// The grid drops a day under the streak threshold, so the label must too.
	// `intensity` is the thresholded verdict; `durationMs` is not.
	it("ignores a day the grid did not light up", () => {
		const belowThreshold: CalendarDay = { ...calDay("2026-05-12", 0), durationMs: 30_000 };
		const summary = summariseMonth([calDay("2026-05-11", 40), belowThreshold], "May");
		expect(summary).toContain("read on 1 of 2 days");
		expect(summary).not.toContain("May 12");
	});

	it("says so for a month with no reading", () => {
		expect(summariseMonth([calDay("2026-05-01", 0)], "May")).toBe("May: no reading recorded.");
	});

	it("handles a month with a single read day", () => {
		const summary = summariseMonth([calDay("2026-05-04", 45)], "May");
		expect(summary).toContain("read on 1 of 1 days");
		expect(summary).toContain("May 4");
	});
});

describe("summariseHours", () => {
	it("names the busiest hour and its share", () => {
		const hours = new Array(24).fill(0);
		hours[2] = 90;
		hours[20] = 30;
		const summary = summariseHours(hours);
		expect(summary).toContain("02:00");
		expect(summary).toContain("75%");
	});

	// The loop bound has to cover the final hour; a `< length - 1` slip would
	// report a quieter hour as the busiest for anyone who reads late.
	it("finds a peak in the last hour of the day", () => {
		const hours = new Array(24).fill(0);
		hours[9] = 20;
		hours[23] = 60;
		expect(summariseHours(hours)).toContain("23:00");
	});

	// Every hour ties at zero, and a plain max would report midnight as this
	// reader's favourite hour on the strength of no data at all.
	it("refuses to name an hour when there is no reading", () => {
		expect(summariseHours(new Array(24).fill(0))).toBe(
			"No reading recorded yet, so there is no busiest hour.",
		);
	});
});

describe("summariseWpmTrend", () => {
	function trend(measured: number[], overrides: Partial<WpmTrend> = {}): WpmTrend {
		return {
			granularity: "day",
			measured: measured.map((avgWpm, i) => ({ bucketStart: i, avgWpm })),
			rsvpTarget: [],
			averages: { measured: 300, rsvpTarget: 0 },
			...overrides,
		};
	}

	it("gives the average and the range", () => {
		const summary = summariseWpmTrend(trend([250, 300, 350]), "Last 7 days");
		expect(summary).toContain("Last 7 days");
		expect(summary).toContain("300 words per minute");
		expect(summary).toContain("from 250 to 350");
	});

	it("does not describe a single value as a range", () => {
		expect(summariseWpmTrend(trend([300]), "Today")).toContain("steady at 300");
	});

	// Empty buckets are zeroes in the series, not gaps, so an unfiltered min would
	// always report 0 as the low.
	it("ignores empty buckets when reporting the range", () => {
		expect(summariseWpmTrend(trend([0, 250, 0, 350]), "Last 7 days")).toContain("from 250 to 350");
	});

	it("mentions the dial only when RSVP was used", () => {
		expect(summariseWpmTrend(trend([300]), "Today")).not.toContain("RSVP");
		const withDial = trend([300], { averages: { measured: 300, rsvpTarget: 450 } });
		expect(summariseWpmTrend(withDial, "Today")).toContain("RSVP dial set to 450");
	});

	it("says so when nothing was read", () => {
		expect(summariseWpmTrend(trend([]), "Today")).toBe(
			"No reading speed recorded for this period.",
		);
	});
});

describe("summariseSpeedBuckets", () => {
	function bucket(wpm: number, sessions = 1): SpeedBucket {
		return { startedAt: 0, endedAt: 0, wpm, sessions };
	}

	it("totals the sittings and reports the direction of travel", () => {
		const summary = summariseSpeedBuckets([bucket(250, 3), bucket(280), bucket(310, 2)]);
		expect(summary).toContain("6 sittings");
		expect(summary).toContain("from 250 to 310");
		expect(summary).toContain("speeding up");
	});

	it("reports slowing down", () => {
		expect(summariseSpeedBuckets([bucket(310), bucket(250)])).toContain("slowing down");
	});

	it("reports no change without claiming a direction", () => {
		expect(summariseSpeedBuckets([bucket(300), bucket(300)])).toContain("holding steady");
	});

	it("says so when there is nothing to plot", () => {
		expect(summariseSpeedBuckets([])).toBe("Not enough reading yet to show a speed trend.");
	});
});
