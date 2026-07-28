/**
 * Pure aggregation over reading-session rows. Kept free of `db` imports so the
 * local-day and DST arithmetic can be tested directly under an arbitrary
 * timezone; the query functions in `stats.ts` only fetch rows and hand them here.
 */
import { localDateKey, previousLocalDayStart, startOfLocalDay } from "../../utils/date-utils";

const HEATMAP_DAYS = 90;

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

export interface WeeklyWpm {
	weekStart: number;
	avgWpm: number;
}

export interface WeeklyWpmSeries {
	/** Configured RSVP dial setting, weighted by words. */
	rsvpTarget: WeeklyWpm[];
	/** Actual rate the RSVP engine delivered (lower than target due to
	 * punctuation pauses + accel ramp). Computed from words / active minutes. */
	rsvpDelivered: WeeklyWpm[];
	/** Natural reading speed in scroll/page modes. */
	read: WeeklyWpm[];
	/**
	 * Words-weighted average per series over the whole window. Returned rather
	 * than derived from the points, because averaging the weekly averages gives a
	 * week with one 10-word session the same say as a week with 300k.
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

function addToBucket(map: Map<number, Bucket>, weekStart: number, wpm: number, words: number) {
	const bucket = map.get(weekStart) ?? { sumWordsWpm: 0, sumWords: 0 };
	bucket.sumWordsWpm += wpm * words;
	bucket.sumWords += words;
	map.set(weekStart, bucket);
}

/**
 * Weekly WPM trend with three series, all words-weighted so one short session
 * can't dominate a week. Each session contributes to whichever buckets apply
 * to its mode.
 */
export function buildWeeklyWpm(rows: WpmSession[], weeks: number, now: number): WeeklyWpmSeries {
	const targetBuckets = new Map<number, Bucket>();
	const deliveredBuckets = new Map<number, Bucket>();
	const readBuckets = new Map<number, Bucket>();

	for (const r of rows) {
		const week = weekStartLocal(r.startedAt);
		const words = Math.max(1, r.words);
		if (r.mode === "rsvp") {
			if (r.wpmAvg != null) addToBucket(targetBuckets, week, r.wpmAvg, words);
			if (r.durationMs > 1000) {
				const delivered = Math.round(r.words / (r.durationMs / 60_000));
				if (delivered > 0) addToBucket(deliveredBuckets, week, delivered, words);
			}
		} else if (r.wpmAvg != null) {
			addToBucket(readBuckets, week, r.wpmAvg, words);
		}
	}

	const weekStarts = weekStartsFor(weeks, now);

	function buildSeries(buckets: Map<number, Bucket>): WeeklyWpm[] {
		return weekStarts.map((weekStart) => {
			const b = buckets.get(weekStart);
			return {
				weekStart,
				avgWpm: b && b.sumWords > 0 ? Math.round(b.sumWordsWpm / b.sumWords) : 0,
			};
		});
	}

	function averageOver(buckets: Map<number, Bucket>): number {
		let sumWordsWpm = 0;
		let sumWords = 0;
		for (const weekStart of weekStarts) {
			const b = buckets.get(weekStart);
			if (!b) continue;
			sumWordsWpm += b.sumWordsWpm;
			sumWords += b.sumWords;
		}
		return sumWords > 0 ? Math.round(sumWordsWpm / sumWords) : 0;
	}

	return {
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
 * Also the fetch horizon, so the query window and the buckets cannot disagree.
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
