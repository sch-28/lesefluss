/**
 * Pure aggregation over reading-session rows. Kept free of `db` imports so the
 * local-day and DST arithmetic can be tested directly under an arbitrary
 * timezone; the query functions in `stats.ts` only fetch rows and hand them here.
 */
import { localDateKey, previousLocalDayStart, startOfLocalDay } from "../../utils/date-utils";

const MS_PER_DAY = 86_400_000;

/** A local day counts toward a streak once its sessions sum to this much. */
export const MIN_STREAK_MINUTES = 1;

export interface StreakResult {
	current: number;
	longest: number;
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

/**
 * Active milliseconds per local day, keyed by `localDateKey`.
 *
 * Local rather than UTC: a sitting at 00:30 belongs to the day the reader thinks
 * it does. Shared by the streak scan and the best-day record, which were
 * bucketing the same rows two different ways.
 */
export function sumDurationByLocalDay(rows: SessionTiming[]): Map<string, number> {
	const msByDay = new Map<string, number>();
	for (const row of rows) {
		const key = localDateKey(row.startedAt);
		msByDay.set(key, (msByDay.get(key) ?? 0) + row.durationMs);
	}
	return msByDay;
}

export function summariseStreak(rows: SessionTiming[], now: number): StreakResult {
	const minutesByDay = new Map<string, number>();
	for (const [key, ms] of sumDurationByLocalDay(rows)) {
		minutesByDay.set(key, ms / 60_000);
	}
	// Threshold applies to the day's total, not to each sitting: several short
	// sittings are still a day's reading.
	for (const [key, minutes] of minutesByDay) {
		if (minutes < MIN_STREAK_MINUTES) minutesByDay.delete(key);
	}

	let current = 0;
	let cursor = startOfLocalDay(now);
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

	return { current, longest: Math.max(longest, current) };
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
	/**
	 * Reading speed: words actually read per active minute, across every mode.
	 *
	 * One series, not one per mode. The reader wants to know how fast they get
	 * through a book; whether a given sitting used RSVP or scrolling is a detail
	 * of how, not a different quantity. Splitting it meant a reader who used both
	 * saw only whichever mode won a priority list.
	 */
	measured: WpmPoint[];
	/** Configured RSVP dial, words-weighted. An input, not a speed — shown only
	 *  as a reference against the measured line. */
	rsvpTarget: WpmPoint[];
	/**
	 * Words-weighted average per series over the whole window. Returned rather
	 * than derived from the points, because averaging the per-bucket averages
	 * gives a bucket holding one 10-word session the same say as one holding 300k.
	 */
	averages: Record<"measured" | "rsvpTarget", number>;
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
 * WPM trend, words-weighted so one short session can't dominate a bucket. Every
 * session feeds `measured` regardless of mode — that is the one figure the user
 * asked for. `rsvpTarget` is a reference line built from the dial on RSVP rows
 * only. Bucket width follows the selected period.
 */
export function buildWpmTrend(
	rows: WpmSession[],
	buckets: { granularity: TrendGranularity; starts: number[] },
): WpmTrend {
	const measuredBuckets = new Map<number, Bucket>();
	const targetBuckets = new Map<number, Bucket>();

	for (const r of rows) {
		const bucketStart = bucketStartFor(buckets.granularity, r.startedAt);
		// Every mode contributes to one measured series. `wpmAvg` is not usable
		// here: on rsvp rows it holds the dial, which is an input.
		if (isPlausibleRate(r.words, r.durationMs)) {
			const wpm = Math.round(r.words / (r.durationMs / 60_000));
			if (wpm > 0) addToBucket(measuredBuckets, bucketStart, wpm, r.words);
		}
		if (r.mode === "rsvp" && r.wpmAvg != null) {
			addToBucket(targetBuckets, bucketStart, r.wpmAvg, Math.max(1, r.words));
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
		measured: buildSeries(measuredBuckets),
		rsvpTarget: buildSeries(targetBuckets),
		averages: {
			measured: averageOver(measuredBuckets),
			rsvpTarget: averageOver(targetBuckets),
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

export interface ReadingRates {
	/** Delivered ÷ target for RSVP. The engine spends time on punctuation pauses
	 *  and the acceleration ramp, so it delivers well under the dial. */
	rsvpDeliveredRatio: number | null;
	scrollWpm: number | null;
	pageWpm: number | null;
}

/** Measured when there is no history yet. See task-46.3: delivered lands around
 *  63% of nominal. */
export const DEFAULT_RSVP_DELIVERED_RATIO = 0.65;

/** Below this a sitting is too short for its rate to mean anything. */
export const MIN_MEASURABLE_MS = 1000;

/**
 * Above this a sitting is not reading. Jumping the position (a table-of-contents
 * tap, a fling-scroll, a resync) credits thousands of words against seconds of
 * active time, and because every speed figure here is words-weighted, one such
 * row outvotes a hundred real ones. Real sittings on the device DB top out around
 * 600 wpm; the offenders sit between 2,000 and 49,000.
 *
 * Trained speed-readers reach roughly 1,000 wpm, so this leaves generous headroom
 * above anything a person can actually do while still catching position jumps.
 */
export const MAX_PLAUSIBLE_WPM = 1500;

/**
 * Whether a sitting's *rate* can be trusted. Deliberately not a filter on the
 * sitting itself: the words were read and the time was spent, so they still count
 * toward totals. Only the derived speed is discarded.
 */
export function isPlausibleRate(words: number, durationMs: number): boolean {
	if (durationMs <= MIN_MEASURABLE_MS || words <= 0) return false;
	return words / (durationMs / 60_000) <= MAX_PLAUSIBLE_WPM;
}

export interface RateSession {
	mode: "rsvp" | "scroll" | "page";
	wpmAvg: number | null;
	wordsRead: number;
	durationMs: number;
}

/**
 * How fast this reader actually reads, per mode, for estimating time remaining.
 *
 * Words-weighted so a one-paragraph sitting cannot swing the estimate. Callers
 * pass the most recent sessions rather than all of them: the RSVP ratio moves
 * when the punctuation-delay settings change, and a lifetime average would take
 * months to catch up.
 */
export function summariseReadingRates(rows: RateSession[]): ReadingRates {
	let rsvpDeliveredWords = 0;
	let rsvpTargetWordsWpm = 0;
	let rsvpTargetWords = 0;
	let rsvpActiveMs = 0;
	const measured = new Map<"scroll" | "page", { words: number; activeMs: number }>();

	for (const r of rows) {
		if (!isPlausibleRate(r.wordsRead, r.durationMs)) continue;
		if (r.mode === "rsvp") {
			// Both halves of the ratio come from the same rows: counting a
			// dial-less session's words as delivered while excluding it from the
			// target divides one population by another.
			if (r.wpmAvg == null || r.wpmAvg <= 0) continue;
			rsvpDeliveredWords += r.wordsRead;
			rsvpActiveMs += r.durationMs;
			rsvpTargetWordsWpm += r.wpmAvg * r.wordsRead;
			rsvpTargetWords += r.wordsRead;
			continue;
		}
		const bucket = measured.get(r.mode) ?? { words: 0, activeMs: 0 };
		bucket.words += r.wordsRead;
		bucket.activeMs += r.durationMs;
		measured.set(r.mode, bucket);
	}

	const deliveredWpm = rsvpActiveMs > 0 ? rsvpDeliveredWords / (rsvpActiveMs / 60_000) : null;
	const targetWpm = rsvpTargetWords > 0 ? rsvpTargetWordsWpm / rsvpTargetWords : null;

	function wpmOf(mode: "scroll" | "page"): number | null {
		const bucket = measured.get(mode);
		if (!bucket || bucket.activeMs <= 0) return null;
		return Math.max(1, Math.round(bucket.words / (bucket.activeMs / 60_000)));
	}

	return {
		rsvpDeliveredRatio:
			deliveredWpm !== null && targetWpm !== null && targetWpm > 0
				? deliveredWpm / targetWpm
				: null,
		scrollWpm: wpmOf("scroll"),
		pageWpm: wpmOf("page"),
	};
}

export interface SpeedSample {
	startedAt: number;
	wpm: number;
	/** Weight. A 30-second sitting should not move the line as much as an hour. */
	words: number;
}

export interface SpeedBucket {
	/** First and last sitting folded into this point, for the tooltip. */
	startedAt: number;
	endedAt: number;
	wpm: number;
	sessions: number;
}

/**
 * Fold a book's sittings into at most `maxBuckets` points.
 *
 * Ninety sittings plotted individually is a scribble: the points overlap, their
 * labels collide, and no trend is visible. Buckets hold a fixed number of
 * *consecutive* sittings rather than a fixed time span, so a book read in two
 * bursts months apart still produces an evenly spaced line instead of one dense
 * clump at each end and a void between.
 *
 * The x axis is therefore reading order, not elapsed time, which is the
 * question this chart answers: did I speed up as I got into the book?
 */
export function bucketSpeedSeries(samples: SpeedSample[], maxBuckets: number): SpeedBucket[] {
	if (samples.length === 0) return [];
	const ordered = [...samples].sort((a, b) => a.startedAt - b.startedAt);
	const perBucket = Math.ceil(ordered.length / maxBuckets);

	const out: SpeedBucket[] = [];
	for (let i = 0; i < ordered.length; i += perBucket) {
		const slice = ordered.slice(i, i + perBucket);
		let sumWordsWpm = 0;
		let sumWords = 0;
		for (const s of slice) {
			sumWordsWpm += s.wpm * s.words;
			sumWords += s.words;
		}
		out.push({
			startedAt: slice[0].startedAt,
			endedAt: slice[slice.length - 1].startedAt,
			wpm: Math.round(sumWordsWpm / sumWords),
			sessions: slice.length,
		});
	}
	return out;
}

export interface BookTotals {
	bookId: string;
	seriesId: string | null;
	title: string;
	author: string | null;
	wordCount: number;
	wordPosition: number;
	durationMs: number;
}

export interface WorkTotals {
	workId: string;
	isSeries: boolean;
	title: string;
	author: string | null;
	wordCount: number;
	/** How far into the work the reader is overall, not what they read in the
	 *  selected period. Lets a card say "34% read" without the figure changing
	 *  meaning when the period changes. */
	wordPosition: number;
	durationMs: number;
}

/**
 * Fold per-book totals into per-work totals, longest first.
 *
 * Every chapter of a serial is its own book row, so without this one
 * 400-chapter web novel fills the whole list and no single-file book can rank
 * against it.
 */
export function rollUpWorks(rows: BookTotals[]): WorkTotals[] {
	const works = new Map<string, WorkTotals>();

	for (const row of rows) {
		const isSeries = row.seriesId != null && row.seriesId !== "";
		const workId = isSeries ? (row.seriesId as string) : row.bookId;
		const existing = works.get(workId);
		if (existing) {
			existing.durationMs += Number(row.durationMs);
			continue;
		}
		works.set(workId, {
			workId,
			isSeries,
			title: row.title,
			author: row.author,
			// A serial's length is the sum of its chapters, fetched separately;
			// counting the one chapter seen here would understate it.
			wordCount: isSeries ? 0 : row.wordCount,
			wordPosition: isSeries ? 0 : row.wordPosition,
			durationMs: Number(row.durationMs),
		});
	}

	return [...works.values()].sort((a, b) => b.durationMs - a.durationMs);
}
