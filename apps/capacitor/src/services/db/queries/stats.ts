import { and, desc, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { localDateKey, previousLocalDayStart, startOfLocalDay } from "../../../utils/date-utils";
import { db } from "../index";
import { bookContent, books, readingSessions } from "../schema";

/** Same threshold as `series.ts` / `sort-filter.ts`. Keep both in sync. */
const FINISHED_PERCENT_THRESHOLD = 95;

const MS_PER_DAY = 86_400_000;

export interface PeriodTotals {
	minutes: number;
	words: number;
	booksFinished: number;
}

/**
 * Totals for a window `[periodStart, periodEnd)`. `periodEnd` defaults to now.
 * "Books finished" = books whose `lastRead` falls in window AND `position` is
 * past the 95% threshold (cheapest signal; see series.ts:205).
 */
export async function getPeriodTotals(
	periodStart: number,
	periodEnd: number = Date.now(),
): Promise<PeriodTotals> {
	const sessionsRow = await db
		.select({
			durationMs: sql<number>`COALESCE(SUM(${readingSessions.durationMs}), 0)`,
			words: sql<number>`COALESCE(SUM(${readingSessions.wordsRead}), 0)`,
		})
		.from(readingSessions)
		.where(
			and(gte(readingSessions.startedAt, periodStart), lt(readingSessions.startedAt, periodEnd)),
		);

	const finishedRow = await db
		.select({
			count: sql<number>`COUNT(*)`,
		})
		.from(books)
		.where(
			and(
				eq(books.deleted, false),
				isNotNull(books.lastRead),
				gte(books.lastRead, periodStart),
				lt(books.lastRead, periodEnd),
				sql`${books.size} > 0 AND ${books.position} * 100 >= ${books.size} * ${FINISHED_PERCENT_THRESHOLD}`,
			),
		);

	const dur = Number(sessionsRow[0]?.durationMs ?? 0);
	return {
		minutes: Math.round(dur / 60_000),
		words: Number(sessionsRow[0]?.words ?? 0),
		booksFinished: Number(finishedRow[0]?.count ?? 0),
	};
}

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

/**
 * Compute current/longest streak and a 90-day per-day-minutes series for the
 * heatmap. A "day" is any local day with ≥1 minute of reading. Aggregation
 * happens in JS because session timestamps must be bucketed in device-local
 * time, which SQLite cannot reliably do without timezone info.
 */
export async function getStreak(): Promise<StreakResult> {
	const now = Date.now();
	const horizon = startOfLocalDay(now) - 89 * MS_PER_DAY;

	// Pull every session from horizon onward (cheap; one row per sitting).
	// We also need older sessions to compute "longest streak" properly.
	const rows = await db
		.select({
			startedAt: readingSessions.startedAt,
			durationMs: readingSessions.durationMs,
		})
		.from(readingSessions)
		.orderBy(readingSessions.startedAt);

	const minutesByDay = new Map<string, number>();
	for (const r of rows) {
		const minutes = r.durationMs / 60_000;
		if (minutes < 1) continue;
		const key = localDateKey(r.startedAt);
		minutesByDay.set(key, (minutesByDay.get(key) ?? 0) + minutes);
	}

	// Build the 90-day window oldest → newest.
	const last90Days: DailyMinutes[] = [];
	for (let i = 0; i < 90; i++) {
		const dayStart = horizon + i * MS_PER_DAY;
		const date = localDateKey(dayStart);
		last90Days.push({
			date,
			dayStart,
			minutes: Math.round(minutesByDay.get(date) ?? 0),
		});
	}

	// Current streak: walk back from today (or yesterday if today is empty).
	// Walking via previousLocalDayStart keeps the math correct across DST.
	let current = 0;
	let cursor = startOfLocalDay(now);
	if (!minutesByDay.has(localDateKey(cursor))) {
		cursor = previousLocalDayStart(cursor);
	}
	while (minutesByDay.has(localDateKey(cursor))) {
		current++;
		cursor = previousLocalDayStart(cursor);
	}

	// Longest streak: scan all keys sorted ascending. Two keys count as
	// consecutive when the previous local day of `curr` equals `prev`, which
	// avoids the 23h/25h DST trap that `=== MS_PER_DAY` would fall into.
	const keysSet = new Set(minutesByDay.keys());
	const sortedKeys = [...keysSet].sort();
	let longest = 0;
	let run = 0;
	let prevKey: string | null = null;
	for (const key of sortedKeys) {
		const dayStart = startOfLocalDay(new Date(key).getTime());
		const isAdjacent = prevKey != null && localDateKey(previousLocalDayStart(dayStart)) === prevKey;
		run = isAdjacent ? run + 1 : 1;
		if (run > longest) longest = run;
		prevKey = key;
	}

	return { current, longest: Math.max(longest, current), last90Days };
}

export interface TopBook {
	bookId: string;
	title: string;
	author: string | null;
	durationMs: number;
	coverImage: string | null;
}

export async function getTopBooks(opts: { since: number; limit?: number }): Promise<TopBook[]> {
	const limit = opts.limit ?? 5;
	const rows = await db
		.select({
			bookId: readingSessions.bookId,
			durationMs: sql<number>`SUM(${readingSessions.durationMs})`,
		})
		.from(readingSessions)
		.where(gte(readingSessions.startedAt, opts.since))
		.groupBy(readingSessions.bookId)
		.orderBy(sql`SUM(${readingSessions.durationMs}) DESC`)
		.limit(limit);

	if (rows.length === 0) return [];

	const ids = rows.map((r) => r.bookId);
	const bookRows = await db
		.select({
			id: books.id,
			title: books.title,
			author: books.author,
		})
		.from(books)
		.where(inArray(books.id, ids));
	const bookMap = new Map(bookRows.map((b) => [b.id, b]));

	const coverRows = await db
		.select({
			bookId: bookContent.bookId,
			coverImage: bookContent.coverImage,
		})
		.from(bookContent)
		.where(inArray(bookContent.bookId, ids));
	const coverMap = new Map(coverRows.map((c) => [c.bookId, c.coverImage]));

	return rows
		.map((r) => {
			const book = bookMap.get(r.bookId);
			if (!book) return null;
			return {
				bookId: r.bookId,
				title: book.title,
				author: book.author,
				durationMs: Number(r.durationMs),
				coverImage: coverMap.get(r.bookId) ?? null,
			};
		})
		.filter((x): x is TopBook => x !== null);
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
}

function weekStartLocal(epochMs: number): number {
	const d = new Date(startOfLocalDay(epochMs));
	const dow = (d.getDay() + 6) % 7;
	return d.getTime() - dow * MS_PER_DAY;
}

/**
 * Weekly WPM trend with three series, all words-weighted so one short session
 * can't dominate a week. Each session contributes to whichever buckets apply
 * to its mode.
 */
export async function getWeeklyWpm(opts: { weeks: number }): Promise<WeeklyWpmSeries> {
	const now = Date.now();
	const horizon = startOfLocalDay(now) - (opts.weeks * 7 - 1) * MS_PER_DAY;

	const rows = await db
		.select({
			startedAt: readingSessions.startedAt,
			mode: readingSessions.mode,
			wpmAvg: readingSessions.wpmAvg,
			words: readingSessions.wordsRead,
			durationMs: readingSessions.durationMs,
		})
		.from(readingSessions)
		.where(gte(readingSessions.startedAt, horizon));

	type Bucket = { sumWordsWpm: number; sumWords: number };
	const targetBuckets = new Map<number, Bucket>();
	const deliveredBuckets = new Map<number, Bucket>();
	const readBuckets = new Map<number, Bucket>();

	function add(map: Map<number, Bucket>, weekStart: number, wpm: number, words: number) {
		const bucket = map.get(weekStart) ?? { sumWordsWpm: 0, sumWords: 0 };
		bucket.sumWordsWpm += wpm * words;
		bucket.sumWords += words;
		map.set(weekStart, bucket);
	}

	for (const r of rows) {
		const w = weekStartLocal(r.startedAt);
		const words = Math.max(1, r.words);
		if (r.mode === "rsvp") {
			if (r.wpmAvg != null) add(targetBuckets, w, r.wpmAvg, words);
			if (r.durationMs > 1000) {
				const delivered = Math.round(r.words / (r.durationMs / 60_000));
				if (delivered > 0) add(deliveredBuckets, w, delivered, words);
			}
		} else if (r.wpmAvg != null) {
			add(readBuckets, w, r.wpmAvg, words);
		}
	}

	const lastWeek = weekStartLocal(now);
	function buildSeries(buckets: Map<number, Bucket>): WeeklyWpm[] {
		const out: WeeklyWpm[] = [];
		for (let i = opts.weeks - 1; i >= 0; i--) {
			const weekStart = lastWeek - i * 7 * MS_PER_DAY;
			const b = buckets.get(weekStart);
			const avg = b && b.sumWords > 0 ? Math.round(b.sumWordsWpm / b.sumWords) : 0;
			out.push({ weekStart, avgWpm: avg });
		}
		return out;
	}

	return {
		rsvpTarget: buildSeries(targetBuckets),
		rsvpDelivered: buildSeries(deliveredBuckets),
		read: buildSeries(readBuckets),
	};
}

/** Sessions bucketed by local hour-of-day. Returns a 24-length minutes-array. */
export async function getHourHistogram(): Promise<number[]> {
	const rows = await db
		.select({
			startedAt: readingSessions.startedAt,
			durationMs: readingSessions.durationMs,
		})
		.from(readingSessions);

	const hours = new Array<number>(24).fill(0);
	for (const r of rows) {
		const hour = new Date(r.startedAt).getHours();
		hours[hour] += r.durationMs / 60_000;
	}
	return hours.map((m) => Math.round(m));
}

export interface PersonalityStats {
	longestSessionMs: number;
	fastestWpm: number;
	mostReadBookId: string | null;
	totalSessions: number;
}

export async function getPersonalityStats(): Promise<PersonalityStats> {
	const aggRow = await db
		.select({
			longest: sql<number>`COALESCE(MAX(${readingSessions.durationMs}), 0)`,
			fastest: sql<number>`COALESCE(MAX(${readingSessions.wpmAvg}), 0)`,
			total: sql<number>`COUNT(*)`,
		})
		.from(readingSessions);

	const topRow = await db
		.select({
			bookId: readingSessions.bookId,
			total: sql<number>`SUM(${readingSessions.durationMs})`,
		})
		.from(readingSessions)
		.groupBy(readingSessions.bookId)
		.orderBy(desc(sql`SUM(${readingSessions.durationMs})`))
		.limit(1);

	return {
		longestSessionMs: Number(aggRow[0]?.longest ?? 0),
		fastestWpm: Number(aggRow[0]?.fastest ?? 0),
		mostReadBookId: topRow[0]?.bookId ?? null,
		totalSessions: Number(aggRow[0]?.total ?? 0),
	};
}

export interface SpeedPoint {
	startedAt: number;
	mode: "rsvp" | "scroll" | "page";
	wpm: number;
}

export interface BookStats {
	totalDurationMs: number;
	sessionCount: number;
	lastReadAt: number | null;
	avgWpmRsvp: number | null;
	speedSeries: SpeedPoint[];
}

/**
 * Per-book aggregation. Single fetch ordered by startedAt; totals + avg
 * computed in JS off the same row set.
 */
export async function getBookStats(bookId: string): Promise<BookStats> {
	const rows = await db
		.select({
			startedAt: readingSessions.startedAt,
			mode: readingSessions.mode,
			durationMs: readingSessions.durationMs,
			wordsRead: readingSessions.wordsRead,
			wpmAvg: readingSessions.wpmAvg,
		})
		.from(readingSessions)
		.where(eq(readingSessions.bookId, bookId))
		.orderBy(readingSessions.startedAt);

	if (rows.length === 0) {
		return {
			totalDurationMs: 0,
			sessionCount: 0,
			lastReadAt: null,
			avgWpmRsvp: null,
			speedSeries: [],
		};
	}

	let totalDurationMs = 0;
	let lastReadAt = 0;
	let rsvpSumWordsWpm = 0;
	let rsvpSumWords = 0;
	const speedSeries: SpeedPoint[] = [];

	for (const r of rows) {
		totalDurationMs += r.durationMs;
		if (r.startedAt > lastReadAt) lastReadAt = r.startedAt;
		if (r.mode === "rsvp" && r.wpmAvg != null) {
			const w = Math.max(1, r.wordsRead);
			rsvpSumWordsWpm += r.wpmAvg * w;
			rsvpSumWords += w;
		}
		if (r.wpmAvg != null) {
			speedSeries.push({ startedAt: r.startedAt, mode: r.mode, wpm: r.wpmAvg });
		}
	}

	return {
		totalDurationMs,
		sessionCount: rows.length,
		lastReadAt,
		avgWpmRsvp: rsvpSumWords > 0 ? Math.round(rsvpSumWordsWpm / rsvpSumWords) : null,
		speedSeries,
	};
}

export async function getSessionCount(): Promise<number> {
	const row = await db.select({ count: sql<number>`COUNT(*)` }).from(readingSessions);
	return Number(row[0]?.count ?? 0);
}
