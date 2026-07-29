import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localDateKey, previousLocalDayStart } from "../../../utils/date-utils";
import {
	bucketMinutesByHour,
	buildWeeklyWpm,
	summariseStreak,
	type WpmSession,
	weekStartsFor,
} from "../aggregate";

const ORIGINAL_TZ = process.env.TZ;

function useTimezone(tz: string) {
	beforeAll(() => {
		process.env.TZ = tz;
	});
	afterAll(() => {
		process.env.TZ = ORIGINAL_TZ;
	});
}

function at(y: number, m: number, d: number, h = 12): number {
	return new Date(y, m - 1, d, h).getTime();
}

function minutes(n: number): number {
	return n * 60_000;
}

function rsvpSession(startedAt: number, wpm: number): WpmSession {
	return { startedAt, mode: "rsvp", wpmAvg: wpm, words: 1000, durationMs: minutes(10) };
}

describe.each([
	"Europe/Berlin",
	"America/New_York",
	"Pacific/Auckland",
])("summariseStreak in %s", (tz) => {
	useTimezone(tz);

	it("counts a day whose sittings only sum past the threshold", () => {
		const day = at(2026, 5, 10);
		const rows = Array.from({ length: 5 }, (_, i) => ({
			startedAt: day + i * 60_000,
			durationMs: 50_000,
		}));
		const result = summariseStreak(rows, at(2026, 5, 10, 23));
		expect(result.current).toBe(1);
	});

	it("ignores a day that stays under the threshold in total", () => {
		const day = at(2026, 5, 10);
		const result = summariseStreak([{ startedAt: day, durationMs: 20_000 }], day + minutes(60));
		expect(result.current).toBe(0);
	});

	it("counts consecutive local days as one streak", () => {
		const rows = [at(2026, 5, 8), at(2026, 5, 9), at(2026, 5, 10)].map((startedAt) => ({
			startedAt,
			durationMs: minutes(30),
		}));
		const result = summariseStreak(rows, at(2026, 5, 10, 20));
		expect(result.current).toBe(3);
		expect(result.longest).toBe(3);
	});

	it("breaks the streak on a missing day", () => {
		const rows = [at(2026, 5, 4), at(2026, 5, 5), at(2026, 5, 8), at(2026, 5, 9)].map(
			(startedAt) => ({ startedAt, durationMs: minutes(30) }),
		);
		const result = summariseStreak(rows, at(2026, 5, 9, 20));
		expect(result.current).toBe(2);
		expect(result.longest).toBe(2);
	});

	// `Math.max(longest, current)` on the return means any case where the two
	// coincide would still pass with the longest-streak scan deleted outright.
	it("reports a long past streak while the current one is short", () => {
		const days = [
			...[3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((d) => at(2026, 2, d)),
			at(2026, 5, 9),
			at(2026, 5, 10),
		];
		const rows = days.map((startedAt) => ({ startedAt, durationMs: minutes(30) }));
		const result = summariseStreak(rows, at(2026, 5, 10, 20));
		expect(result.current).toBe(2);
		expect(result.longest).toBe(10);
	});

	it("returns 90 consecutive local days ending today", () => {
		const now = at(2026, 11, 15);
		expectContiguousWindowEndingToday(summariseStreak([], now).last90Days, now);
	});
});

/**
 * The window must end on today and step exactly one local day at a time. A
 * distinct-date count is not enough: a fixed-millisecond grid can skip a
 * calendar day at spring-forward and overshoot the end while still producing 90
 * distinct keys.
 */
function expectContiguousWindowEndingToday(
	days: { date: string; dayStart: number }[],
	now: number,
) {
	expect(days).toHaveLength(90);
	expect(days.at(-1)?.date).toBe(localDateKey(now));
	for (let i = days.length - 1; i > 0; i--) {
		expect(days[i - 1]?.date).toBe(localDateKey(previousLocalDayStart(days[i]?.dayStart ?? 0)));
	}
}

describe.each([
	["autumn fall-back", 2026, 11, 15],
	["spring forward", 2026, 4, 20],
])("summariseStreak across %s", (_label, year, month, day) => {
	useTimezone("America/New_York");

	it("keeps the 90-day window contiguous and ending today", () => {
		const now = at(year, month, day);
		expectContiguousWindowEndingToday(summariseStreak([], now).last90Days, now);
	});

	it("keeps a streak intact across the transition", () => {
		const rows = [at(2026, 10, 31), at(2026, 11, 1), at(2026, 11, 2)].map((startedAt) => ({
			startedAt,
			durationMs: minutes(30),
		}));
		const result = summariseStreak(rows, at(2026, 11, 2, 20));
		expect(result.current).toBe(3);
	});
});

describe("bucketMinutesByHour", () => {
	useTimezone("Europe/Berlin");

	it("keeps a session inside its own hour", () => {
		const hours = bucketMinutesByHour([
			{
				startedAt: at(2026, 5, 10, 14),
				endedAt: at(2026, 5, 10, 14) + minutes(30),
				durationMs: minutes(30),
			},
		]);
		expect(hours[14]).toBe(30);
		expect(hours.reduce((a, b) => a + b, 0)).toBe(30);
	});

	it("splits a sitting across the hours it covers", () => {
		const start = new Date(at(2026, 5, 10, 22)).setMinutes(30, 0, 0);
		const hours = bucketMinutesByHour([
			{ startedAt: start, endedAt: start + minutes(105), durationMs: minutes(105) },
		]);
		expect(hours[22]).toBe(30);
		expect(hours[23]).toBe(60);
		expect(hours[0]).toBe(15);
	});

	it("carries a midnight-spanning sitting onto the next day's hours", () => {
		const start = new Date(at(2026, 5, 10, 23)).setMinutes(30, 0, 0);
		const hours = bucketMinutesByHour([
			{ startedAt: start, endedAt: start + minutes(60), durationMs: minutes(60) },
		]);
		expect(hours[23]).toBe(30);
		expect(hours[0]).toBe(30);
	});

	// Active time excludes pauses, so it is spread over the elapsed span rather
	// than assumed to fill it.
	it("distributes active time, not elapsed time", () => {
		const start = new Date(at(2026, 5, 10, 22)).setMinutes(0, 0, 0);
		const hours = bucketMinutesByHour([
			{ startedAt: start, endedAt: start + minutes(120), durationMs: minutes(60) },
		]);
		expect(hours[22]).toBe(30);
		expect(hours[23]).toBe(30);
	});

	it("falls back to the start hour when a sitting has no elapsed span", () => {
		const start = at(2026, 5, 10, 9);
		const hours = bucketMinutesByHour([
			{ startedAt: start, endedAt: start, durationMs: minutes(20) },
		]);
		expect(hours[9]).toBe(20);
	});

	// A sitting left in the background records its end as the moment the user
	// returned, so the raw span would credit hours that had no reading at all.
	it("does not smear a backgrounded sitting across the whole night", () => {
		const start = new Date(at(2026, 5, 10, 22)).setMinutes(0, 0, 0);
		const hours = bucketMinutesByHour([
			{ startedAt: start, endedAt: start + minutes(600), durationMs: minutes(20) },
		]);
		expect(hours[22]).toBe(20);
		// Pins the ratio: a looser clamp would bleed into the following hour.
		expect(hours[23]).toBe(0);
		expect(hours.slice(0, 6).every((m) => m === 0)).toBe(true);
	});

	it("returns 24 zeroes for no sessions", () => {
		expect(bucketMinutesByHour([])).toEqual(new Array(24).fill(0));
	});
});

describe("weekStartsFor", () => {
	useTimezone("Europe/Berlin");

	it("ends on the Monday midnight of the current week", () => {
		const start = new Date(weekStartsFor(1, at(2026, 5, 13))[0] as number);
		expect(start.getDay()).toBe(1);
		expect(start.getHours()).toBe(0);
		expect(start.getDate()).toBe(11);
	});

	it("returns the same week for every day of one week", () => {
		const starts = [11, 12, 13, 14, 15, 16, 17].map((d) => weekStartsFor(1, at(2026, 5, d))[0]);
		expect(new Set(starts).size).toBe(1);
	});

	// The fetch window in getWeeklyWpm is this array's first element, so a drift
	// between the two would silently blank the oldest bar of the chart.
	it("starts exactly one bucket span before the newest, for any count", () => {
		for (const weeks of [1, 4, 12, 52]) {
			const starts = weekStartsFor(weeks, at(2026, 4, 20));
			expect(starts).toHaveLength(weeks);
			expect(starts.at(-1)).toBe(weekStartsFor(1, at(2026, 4, 20))[0]);
			expect([...starts].sort((a, b) => a - b)).toEqual(starts);
		}
	});
});

describe.each(["Europe/Berlin", "America/New_York"])("buildWeeklyWpm in %s", (tz) => {
	useTimezone(tz);

	// Spring-forward is inside this window in both zones. Looking buckets up on a
	// fixed 7-day millisecond grid drifts an hour past the transition, so every
	// week before it misses and renders as zero.
	it("fills every bucket when each week has a session, across a DST transition", () => {
		const now = at(2026, 4, 20);
		const rows: WpmSession[] = [];
		for (let week = 0; week < 12; week++) {
			rows.push(rsvpSession(now - week * 7 * 86_400_000, 300));
		}
		const series = buildWeeklyWpm(rows, 12, now);
		expect(series.rsvpTarget).toHaveLength(12);
		expect(series.rsvpTarget.filter((w) => w.avgWpm === 0)).toHaveLength(0);
	});

	it("orders buckets oldest to newest", () => {
		const series = buildWeeklyWpm([], 12, at(2026, 4, 20));
		const starts = series.rsvpTarget.map((w) => w.weekStart);
		expect([...starts].sort((a, b) => a - b)).toEqual(starts);
	});

	it("weights each session by words read", () => {
		const now = at(2026, 4, 20);
		const rows: WpmSession[] = [
			{ startedAt: now, mode: "scroll", wpmAvg: 100, words: 9000, durationMs: minutes(10) },
			{ startedAt: now, mode: "scroll", wpmAvg: 1000, words: 1000, durationMs: minutes(1) },
		];
		const series = buildWeeklyWpm(rows, 12, now);
		expect(series.read.at(-1)?.avgWpm).toBe(190);
	});

	// Averaging the weekly averages would give the 10-word week equal say and
	// report 550 instead of 100.
	it("weights the window average by words, not by week", () => {
		const now = at(2026, 4, 20);
		const rows: WpmSession[] = [
			{ startedAt: now, mode: "scroll", wpmAvg: 100, words: 100_000, durationMs: minutes(10) },
			{
				startedAt: now - 7 * 86_400_000,
				mode: "scroll",
				wpmAvg: 1000,
				words: 10,
				durationMs: minutes(1),
			},
		];
		expect(buildWeeklyWpm(rows, 12, now).averages.read).toBe(100);
	});

	it("reports a zero average for a series with no sessions", () => {
		expect(buildWeeklyWpm([], 12, at(2026, 4, 20)).averages).toEqual({
			rsvpTarget: 0,
			rsvpDelivered: 0,
			read: 0,
		});
	});

	it("keeps rsvp target and delivered apart", () => {
		const now = at(2026, 4, 20);
		// 1000 words in 10 minutes delivers 100 wpm against a 300 dial.
		const series = buildWeeklyWpm([rsvpSession(now, 300)], 12, now);
		expect(series.rsvpTarget.at(-1)?.avgWpm).toBe(300);
		expect(series.rsvpDelivered.at(-1)?.avgWpm).toBe(100);
		expect(series.read.at(-1)?.avgWpm).toBe(0);
	});
});
