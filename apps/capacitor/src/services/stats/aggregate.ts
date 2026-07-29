/**
 * Pure aggregation over reading-session rows. Kept free of `db` imports so the
 * local-day and DST arithmetic can be tested directly under an arbitrary
 * timezone; the query functions in `stats.ts` only fetch rows and hand them here.
 */
import { localDateKey, previousLocalDayStart, startOfLocalDay } from "../../utils/date-utils";

const HEATMAP_DAYS = 90;
const MS_PER_DAY = 86_400_000;

/** A local day counts toward a streak once its sessions sum to this much. */
const MIN_STREAK_MINUTES = 1;

export interface DailyMinutes {
	/** YYYY-MM-DD local date key. */
	date: string;
	/** Epoch ms at start of that local day (sortable). */
	dayStart: number;
	minutes: number;
}

export interface StreakResult {
	current: number;
	longest: number;
	/** Last 90 local days, oldest → newest. Days with no activity have minutes = 0. */
	last90Days: DailyMinutes[];
}

export interface SessionTiming {
	startedAt: number;
	durationMs: number;
}

/** Step back one local week. Looping over `previousLocalDayStart` rather than
 *  subtracting 7 × MS_PER_DAY keeps the result on a local midnight across DST. */
function previousLocalWeekStart(localDayStart: number): number {
	let cursor = localDayStart;
	for (let i = 0; i < 7; i++) cursor = previousLocalDayStart(cursor);
	return cursor;
}

/** Monday 00:00 local of the week containing `epochMs`. */
function weekStartLocal(epochMs: number): number {
	const dayStart = startOfLocalDay(epochMs);
	const mondayOffset = (new Date(dayStart).getDay() + 6) % 7;
	let cursor = dayStart;
	for (let i = 0; i < mondayOffset; i++) cursor = previousLocalDayStart(cursor);
	return cursor;
}

export function summariseStreak(rows: SessionTiming[], now: number): StreakResult {
	const minutesByDay = new Map<string, number>();
	for (const r of rows) {
		const key = localDateKey(r.startedAt);
		minutesByDay.set(key, (minutesByDay.get(key) ?? 0) + r.durationMs / 60_000);
	}
	// Threshold applies to the day's total, not to each sitting: several short
	// sittings are still a day's reading.
	for (const [key, minutes] of minutesByDay) {
		if (minutes < MIN_STREAK_MINUTES) minutesByDay.delete(key);
	}

	const last90Days: DailyMinutes[] = [];
	let cursor = startOfLocalDay(now);
	for (let i = 0; i < HEATMAP_DAYS; i++) {
		const date = localDateKey(cursor);
		last90Days.push({ date, dayStart: cursor, minutes: Math.round(minutesByDay.get(date) ?? 0) });
		cursor = previousLocalDayStart(cursor);
	}
	last90Days.reverse();

	let current = 0;
	cursor = startOfLocalDay(now);
	if (!minutesByDay.has(localDateKey(cursor))) cursor = previousLocalDayStart(cursor);
	while (minutesByDay.has(localDateKey(cursor))) {
		current++;
		cursor = previousLocalDayStart(cursor);
	}

	// Split manually: new Date("YYYY-MM-DD") parses as UTC midnight, landing on
	// the previous local day west of Greenwich.
	const dayStartsDesc = [...minutesByDay.keys()]
		.sort()
		.reverse()
		.map((key) => {
			const [y, m, d] = key.split("-").map(Number);
			return new Date(y, m - 1, d).getTime();
		});
	let longest = 0;
	let run = 0;
	let expected: number | null = null;
	for (const dayStart of dayStartsDesc) {
		run = expected !== null && dayStart === expected ? run + 1 : 1;
		if (run > longest) longest = run;
		expected = previousLocalDayStart(dayStart);
	}

	return { current, longest: Math.max(longest, current), last90Days };
}

export interface SessionSpan {
	startedAt: number;
	endedAt: number;
	durationMs: number;
}

const HOURS_IN_DAY = 24;

/** A sitting may contain plenty of short pauses, so elapsed time legitimately
 *  exceeds active time. Beyond this multiple the span is not trustworthy.
 *
 *  The tracker no longer produces such rows: it now ends a sitting at its last
 *  activity rather than when the row happens to be written. This guard is for
 *  the rows already recorded and synced under the old behaviour. */
const MAX_ELAPSED_TO_ACTIVE_RATIO = 3;

/**
 * Minutes read per local hour of day. A sitting is spread across the wall-clock
 * hours it actually covers, so a 22:30 to 00:15 session credits three hours
 * rather than dumping all of it on hour 22.
 *
 * Active time is distributed evenly over the sitting's elapsed span. That is an
 * approximation: pauses are not timestamped, so there is no way to know which
 * hour the idle time fell in.
 *
 * The span is clamped because a sitting that was backgrounded and resumed hours
 * later records `endedAt` as the moment the user came back. Smearing over the
 * raw span would credit hours the tracker's own idle rule says had no reading.
 */
export function bucketMinutesByHour(rows: SessionSpan[]): number[] {
	const hours = new Array<number>(HOURS_IN_DAY).fill(0);

	for (const row of rows) {
		const span = Math.min(
			row.endedAt - row.startedAt,
			row.durationMs * MAX_ELAPSED_TO_ACTIVE_RATIO,
		);
		const endedAt = row.startedAt + span;
		if (span <= 0) {
			hours[new Date(row.startedAt).getHours()] += row.durationMs / 60_000;
			continue;
		}

		let cursor = row.startedAt;
		while (cursor < endedAt) {
			const hourOfDay = new Date(cursor).getHours();
			const nextHour = new Date(cursor).setMinutes(60, 0, 0);
			const sliceEnd = Math.min(nextHour, endedAt);
			const share = (sliceEnd - cursor) / span;
			hours[hourOfDay] += (row.durationMs * share) / 60_000;
			cursor = sliceEnd;
		}
	}

	return hours.map((minutes) => Math.round(minutes));
}

export interface WpmPoint {
	bucketStart: number;
	avgWpm: number;
}

export interface WpmTrend {
	granularity: TrendGranularity;
	/** Configured RSVP dial setting, weighted by words. */
	rsvpTarget: WpmPoint[];
	/** Actual rate the RSVP engine delivered (lower than target due to
	 * punctuation pauses + accel ramp). Computed from words / active minutes. */
	rsvpDelivered: WpmPoint[];
	/** Natural reading speed in scroll/page modes. */
	read: WpmPoint[];
	/**
	 * Words-weighted average per series over the whole window. Returned rather
	 * than derived from the points, because averaging the per-bucket averages
	 * gives a bucket holding one 10-word session the same say as one holding 300k.
	 */
	averages: Record<"rsvpTarget" | "rsvpDelivered" | "read", number>;
}

export interface WpmSession {
	startedAt: number;
	mode: "rsvp" | "scroll" | "page";
	wpmAvg: number | null;
	words: number;
	durationMs: number;
}

type Bucket = { sumWordsWpm: number; sumWords: number };

function addToBucket(map: Map<number, Bucket>, bucketStart: number, wpm: number, words: number) {
	const bucket = map.get(bucketStart) ?? { sumWordsWpm: 0, sumWords: 0 };
	bucket.sumWordsWpm += wpm * words;
	bucket.sumWords += words;
	map.set(bucketStart, bucket);
}

/**
 * WPM trend with three series, all words-weighted so one short session can't
 * dominate a bucket. Each session contributes to whichever buckets apply to its
 * mode. Bucket width follows the selected period.
 */
export function buildWpmTrend(
	rows: WpmSession[],
	buckets: { granularity: TrendGranularity; starts: number[] },
): WpmTrend {
	const targetBuckets = new Map<number, Bucket>();
	const deliveredBuckets = new Map<number, Bucket>();
	const readBuckets = new Map<number, Bucket>();

	for (const r of rows) {
		const bucketStart = bucketStartFor(buckets.granularity, r.startedAt);
		const words = Math.max(1, r.words);
		if (r.mode === "rsvp") {
			if (r.wpmAvg != null) addToBucket(targetBuckets, bucketStart, r.wpmAvg, words);
			if (r.durationMs > 1000) {
				const delivered = Math.round(r.words / (r.durationMs / 60_000));
				if (delivered > 0) addToBucket(deliveredBuckets, bucketStart, delivered, words);
			}
		} else if (r.wpmAvg != null) {
			addToBucket(readBuckets, bucketStart, r.wpmAvg, words);
		}
	}

	function buildSeries(source: Map<number, Bucket>): WpmPoint[] {
		return buckets.starts.map((bucketStart) => {
			const b = source.get(bucketStart);
			return {
				bucketStart,
				avgWpm: b && b.sumWords > 0 ? Math.round(b.sumWordsWpm / b.sumWords) : 0,
			};
		});
	}

	function averageOver(source: Map<number, Bucket>): number {
		let sumWordsWpm = 0;
		let sumWords = 0;
		for (const bucketStart of buckets.starts) {
			const b = source.get(bucketStart);
			if (!b) continue;
			sumWordsWpm += b.sumWordsWpm;
			sumWords += b.sumWords;
		}
		return sumWords > 0 ? Math.round(sumWordsWpm / sumWords) : 0;
	}

	return {
		granularity: buckets.granularity,
		rsvpTarget: buildSeries(targetBuckets),
		rsvpDelivered: buildSeries(deliveredBuckets),
		read: buildSeries(readBuckets),
		averages: {
			rsvpTarget: averageOver(targetBuckets),
			rsvpDelivered: averageOver(deliveredBuckets),
			read: averageOver(readBuckets),
		},
	};
}

/**
 * The `weeks` week starts ending with the current one, oldest first. Stepped in
 * local days: a fixed `i * 7 * MS_PER_DAY` grid drifts by an hour past a DST
 * change, so every bucket before it misses and renders as zero.
 *
 */
export function weekStartsFor(weeks: number, now: number): number[] {
	const starts: number[] = [];
	let cursor = weekStartLocal(now);
	for (let i = 0; i < weeks; i++) {
		starts.push(cursor);
		cursor = previousLocalWeekStart(cursor);
	}
	return starts.reverse();
}

export type TrendGranularity = "hour" | "day" | "week" | "month";
export type TrendPeriod = "today" | "7d" | "30d" | "all";

/** Weeks of all-time history shown before the trend switches to months. */
const ALL_TIME_WEEK_LIMIT = 26;

function hourStartLocal(epochMs: number): number {
	return new Date(epochMs).setMinutes(0, 0, 0);
}

function monthStartLocal(epochMs: number): number {
	const d = new Date(epochMs);
	return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

function previousMonthStart(monthStart: number): number {
	const d = new Date(monthStart);
	return new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime();
}

export function bucketStartFor(granularity: TrendGranularity, epochMs: number): number {
	switch (granularity) {
		case "hour":
			return hourStartLocal(epochMs);
		case "day":
			return startOfLocalDay(epochMs);
		case "week":
			return weekStartLocal(epochMs);
		default:
			return monthStartLocal(epochMs);
	}
}

/**
 * Bucket starts for a period, oldest first, plus the granularity used. Every
 * step walks local calendar units rather than fixed milliseconds so the keys
 * survive a DST change.
 *
 * The oldest entry doubles as the fetch horizon, so the query window and the
 * buckets cannot disagree.
 */
export function trendBucketsFor(
	period: TrendPeriod,
	now: number,
	oldestSessionAt?: number,
): { granularity: TrendGranularity; starts: number[] } {
	if (period === "today") {
		// Deduped because a spring-forward day has no 02:00 and `setHours` folds it
		// onto 03:00, which would plot one hour twice and double its weight in the
		// averages. Stopped at the current hour so the chart doesn't trail a line of
		// zeroes across hours that have not happened.
		const dayStart = startOfLocalDay(now);
		const currentHour = hourStartLocal(now);
		const starts: number[] = [];
		for (let hour = 0; hour < 24; hour++) {
			const start = new Date(dayStart).setHours(hour, 0, 0, 0);
			if (start > currentHour) break;
			if (starts.at(-1) !== start) starts.push(start);
		}
		return { granularity: "hour", starts };
	}

	if (period === "7d" || period === "30d") {
		const days = period === "7d" ? 7 : 30;
		const starts: number[] = [];
		let cursor = startOfLocalDay(now);
		for (let i = 0; i < days; i++) {
			starts.push(cursor);
			cursor = previousLocalDayStart(cursor);
		}
		return { granularity: "day", starts: starts.reverse() };
	}

	// All time: weeks while the history is short enough to read, months beyond.
	const oldest = oldestSessionAt ?? now;
	const weeksBack =
		Math.ceil((weekStartLocal(now) - weekStartLocal(oldest)) / (7 * MS_PER_DAY)) + 1;
	if (weeksBack <= ALL_TIME_WEEK_LIMIT) {
		return { granularity: "week", starts: weekStartsFor(Math.max(1, weeksBack), now) };
	}

	const starts: number[] = [];
	let cursor = monthStartLocal(now);
	const oldestMonth = monthStartLocal(oldest);
	while (cursor >= oldestMonth) {
		starts.push(cursor);
		cursor = previousMonthStart(cursor);
	}
	return { granularity: "month", starts: starts.reverse() };
}
