import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import {
	bucketMinutesByHour,
	buildWpmTrend,
	MIN_MEASURABLE_MS,
	type ReadingRates,
	type StreakResult,
	summariseReadingRates,
	summariseStreak,
	type TrendPeriod,
	trendBucketsFor,
	type WpmTrend,
} from "../../stats/aggregate";
import { db } from "../index";
import { bookContent, books, readingSessions, series } from "../schema";

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

	// Counted on when the book was first finished, not on when it was last
	// opened: reopening a book finished in March used to count it as finished
	// today, and March lost it for good.
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
				isNotNull(books.finishedAt),
				gte(books.finishedAt, periodStart),
				lt(books.finishedAt, periodEnd),
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
	/** Book id, or series id when the entry is a rolled-up serial. */
	workId: string;
	isSeries: boolean;
	title: string;
	author: string | null;
	durationMs: number;
	wordsRead: number;
	/** Total length of the work; a serial sums its chapters. 0 when unknown. */
	wordCount: number;
	coverImage: string | null;
}

export async function getTopBooks(opts: { since: number; limit?: number }): Promise<TopBook[]> {
	const limit = opts.limit ?? 5;
	// Grouped by work, not by book row: every chapter of a serial is its own
	// books row, so one 400-chapter web novel would fill the whole list and no
	// single-file book could ever rank against it.
	//
	// Joined rather than filtered afterwards, because applying the limit first
	// and then dropping deleted books returns fewer cards than asked for.
	const workId = sql<string>`COALESCE(${books.seriesId}, ${books.id})`;
	const rows = await db
		.select({
			workId,
			seriesId: sql<string | null>`MAX(${books.seriesId})`,
			durationMs: sql<number>`SUM(${readingSessions.durationMs})`,
			wordsRead: sql<number>`SUM(${readingSessions.wordsRead})`,
		})
		.from(readingSessions)
		.innerJoin(books, eq(books.id, readingSessions.bookId))
		.where(and(gte(readingSessions.startedAt, opts.since), eq(books.deleted, false)))
		.groupBy(workId)
		.orderBy(sql`SUM(${readingSessions.durationMs}) DESC`)
		.limit(limit);

	if (rows.length === 0) return [];

	const seriesIds = rows.map((r) => r.seriesId).filter((id): id is string => id !== null);
	const standaloneIds = rows.filter((r) => r.seriesId === null).map((r) => r.workId);

	const [standaloneRows, seriesRows, chapterTotals, coverRows] = await Promise.all([
		standaloneIds.length > 0
			? db
					.select({
						id: books.id,
						title: books.title,
						author: books.author,
						wordCount: books.wordCount,
					})
					.from(books)
					.where(inArray(books.id, standaloneIds))
			: [],
		seriesIds.length > 0
			? db
					.select({
						id: series.id,
						title: series.title,
						author: series.author,
						coverImage: series.coverImage,
					})
					.from(series)
					.where(inArray(series.id, seriesIds))
			: [],
		seriesIds.length > 0
			? db
					.select({ seriesId: books.seriesId, wordCount: sql<number>`SUM(${books.wordCount})` })
					.from(books)
					.where(and(inArray(books.seriesId, seriesIds), eq(books.deleted, false)))
					.groupBy(books.seriesId)
			: [],
		standaloneIds.length > 0
			? db
					.select({ bookId: bookContent.bookId, coverImage: bookContent.coverImage })
					.from(bookContent)
					.where(inArray(bookContent.bookId, standaloneIds))
			: [],
	]);

	const bookMap = new Map(standaloneRows.map((b) => [b.id, b]));
	const seriesMap = new Map(seriesRows.map((entry) => [entry.id, entry]));
	const chapterWords = new Map(chapterTotals.map((c) => [c.seriesId, Number(c.wordCount)]));
	const coverMap = new Map(coverRows.map((c) => [c.bookId, c.coverImage]));

	return rows
		.map((r): TopBook | null => {
			const base = {
				workId: r.workId,
				durationMs: Number(r.durationMs),
				wordsRead: Number(r.wordsRead),
			};
			if (r.seriesId !== null) {
				const entry = seriesMap.get(r.seriesId);
				return entry
					? {
							...base,
							isSeries: true,
							title: entry.title,
							author: entry.author,
							wordCount: chapterWords.get(r.seriesId) ?? 0,
							coverImage: entry.coverImage,
						}
					: null;
			}
			const entry = bookMap.get(r.workId);
			return entry
				? {
						...base,
						isSeries: false,
						title: entry.title,
						author: entry.author,
						wordCount: entry.wordCount,
						coverImage: coverMap.get(r.workId) ?? null,
					}
				: null;
		})
		.filter((x): x is TopBook => x !== null);
}

export async function getWpmTrend(opts: { period: TrendPeriod; now: number }): Promise<WpmTrend> {
	const now = opts.now;
	// All-time granularity depends on how far back the history goes, so ask the
	// cheapest possible question first rather than fetching every row to find out.
	const oldest =
		opts.period === "all"
			? await db
					.select({ startedAt: sql<number>`MIN(${readingSessions.startedAt})` })
					.from(readingSessions)
					.then((rows) => Number(rows[0]?.startedAt ?? now))
			: undefined;

	const buckets = trendBucketsFor(opts.period, now, oldest);
	const rows = await db
		.select({
			startedAt: readingSessions.startedAt,
			mode: readingSessions.mode,
			wpmAvg: readingSessions.wpmAvg,
			words: readingSessions.wordsRead,
			durationMs: readingSessions.durationMs,
		})
		.from(readingSessions)
		.where(gte(readingSessions.startedAt, buckets.starts[0] as number));

	return buildWpmTrend(rows, buckets);
}

/**
 * Sessions bucketed by local hour-of-day. Returns a 24-length minutes-array.
 * All-time on purpose: "your favourite reading hour, today" is not a statistic.
 */
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

export interface SpeedPoint {
	startedAt: number;
	mode: "rsvp" | "scroll" | "page";
	wpm: number;
}

export interface BookStats {
	totalDurationMs: number;
	sessionCount: number;
	lastReadAt: number | null;
	/** Words-weighted measured rate across every mode, and the mode that
	 *  contributed most of those words. */
	measuredWpm: number | null;
	dominantMode: "rsvp" | "scroll" | "page" | null;
	speedSeries: SpeedPoint[];
}

/** Recent sessions only: the RSVP ratio shifts when the delay settings change,
 *  and a lifetime average would take months to reflect it. */
const RATE_SAMPLE_SIZE = 50;

export async function getReadingRates(): Promise<ReadingRates> {
	const rows = await db
		.select({
			mode: readingSessions.mode,
			wpmAvg: readingSessions.wpmAvg,
			wordsRead: readingSessions.wordsRead,
			durationMs: readingSessions.durationMs,
		})
		.from(readingSessions)
		.orderBy(desc(readingSessions.startedAt))
		.limit(RATE_SAMPLE_SIZE);

	return summariseReadingRates(rows);
}

/**
 * Per-book aggregation. Single fetch ordered by startedAt; totals and averages
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
			measuredWpm: null,
			dominantMode: null,
			speedSeries: [],
		};
	}

	let totalDurationMs = 0;
	let lastReadAt = 0;
	// Measured, not the dial: `wpmAvg` holds the RSVP target on rsvp rows, so it
	// answers "how fast is the engine set", not "how fast was this book read".
	let sumWords = 0;
	let sumActiveMs = 0;
	const wordsByMode = new Map<SpeedPoint["mode"], number>();
	const speedSeries: SpeedPoint[] = [];

	for (const r of rows) {
		totalDurationMs += r.durationMs;
		if (r.startedAt > lastReadAt) lastReadAt = r.startedAt;
		if (r.durationMs > MIN_MEASURABLE_MS && r.wordsRead > 0) {
			sumWords += r.wordsRead;
			sumActiveMs += r.durationMs;
			wordsByMode.set(r.mode, (wordsByMode.get(r.mode) ?? 0) + r.wordsRead);
			speedSeries.push({
				startedAt: r.startedAt,
				mode: r.mode,
				wpm: Math.round(r.wordsRead / (r.durationMs / 60_000)),
			});
		}
	}

	let dominantMode: SpeedPoint["mode"] | null = null;
	let dominantWords = 0;
	for (const [mode, words] of wordsByMode) {
		if (words > dominantWords) {
			dominantMode = mode;
			dominantWords = words;
		}
	}

	return {
		totalDurationMs,
		sessionCount: rows.length,
		lastReadAt,
		measuredWpm: sumActiveMs > 0 ? Math.round(sumWords / (sumActiveMs / 60_000)) : null,
		dominantMode,
		speedSeries,
	};
}
