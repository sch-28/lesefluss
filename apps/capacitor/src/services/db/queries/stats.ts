import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import {
	bucketMinutesByHour,
	buildWeeklyWpm,
	type StreakResult,
	summariseStreak,
	type WeeklyWpmSeries,
	weekStartsFor,
} from "../../stats/aggregate";
import { db } from "../index";
import { bookContent, books, readingSessions } from "../schema";

/** Same threshold as `series.ts` / `sort-filter.ts`. Keep both in sync. */
const FINISHED_PERCENT_THRESHOLD = 95;

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
				// Serial chapters are books rows; forty finished chapters is one book.
				isNull(books.seriesId),
				isNotNull(books.lastRead),
				gte(books.lastRead, periodStart),
				lt(books.lastRead, periodEnd),
				sql`${books.wordCount} > 0 AND ${books.wordPosition} * 100 >= ${books.wordCount} * ${FINISHED_PERCENT_THRESHOLD}`,
			),
		);

	const dur = Number(sessionsRow[0]?.durationMs ?? 0);
	return {
		minutes: Math.round(dur / 60_000),
		words: Number(sessionsRow[0]?.words ?? 0),
		booksFinished: Number(finishedRow[0]?.count ?? 0),
	};
}

/**
 * Compute current/longest streak and a 90-day per-day-minutes series for the
 * heatmap. Aggregation happens in JS because session timestamps must be
 * bucketed in device-local time, which SQLite cannot reliably do without
 * timezone info.
 */
export async function getStreak(): Promise<StreakResult> {
	// Every session, not just the heatmap window: "longest streak" is all-time.
	const rows = await db
		.select({
			startedAt: readingSessions.startedAt,
			durationMs: readingSessions.durationMs,
		})
		.from(readingSessions)
		.orderBy(readingSessions.startedAt);

	return summariseStreak(rows, Date.now());
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
	// Joined rather than filtered afterwards: applying the limit first and then
	// dropping deleted books returns fewer cards than asked for.
	const rows = await db
		.select({
			bookId: readingSessions.bookId,
			title: books.title,
			author: books.author,
			durationMs: sql<number>`SUM(${readingSessions.durationMs})`,
		})
		.from(readingSessions)
		.innerJoin(books, eq(books.id, readingSessions.bookId))
		.where(and(gte(readingSessions.startedAt, opts.since), eq(books.deleted, false)))
		.groupBy(readingSessions.bookId, books.title, books.author)
		.orderBy(sql`SUM(${readingSessions.durationMs}) DESC`)
		.limit(limit);

	if (rows.length === 0) return [];

	const ids = rows.map((r) => r.bookId);

	const coverRows = await db
		.select({
			bookId: bookContent.bookId,
			coverImage: bookContent.coverImage,
		})
		.from(bookContent)
		.where(inArray(bookContent.bookId, ids));
	const coverMap = new Map(coverRows.map((c) => [c.bookId, c.coverImage]));

	return rows.map((r) => ({
		bookId: r.bookId,
		title: r.title,
		author: r.author,
		durationMs: Number(r.durationMs),
		coverImage: coverMap.get(r.bookId) ?? null,
	}));
}

export async function getWeeklyWpm(opts: { weeks: number }): Promise<WeeklyWpmSeries> {
	const now = Date.now();
	const rows = await db
		.select({
			startedAt: readingSessions.startedAt,
			mode: readingSessions.mode,
			wpmAvg: readingSessions.wpmAvg,
			words: readingSessions.wordsRead,
			durationMs: readingSessions.durationMs,
		})
		.from(readingSessions)
		.where(gte(readingSessions.startedAt, weekStartsFor(opts.weeks, now)[0] as number));

	return buildWeeklyWpm(rows, opts.weeks, now);
}

/** Sessions bucketed by local hour-of-day. Returns a 24-length minutes-array. */
export async function getHourHistogram(): Promise<number[]> {
	const rows = await db
		.select({
			startedAt: readingSessions.startedAt,
			endedAt: readingSessions.endedAt,
			durationMs: readingSessions.durationMs,
		})
		.from(readingSessions);

	return bucketMinutesByHour(rows);
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
