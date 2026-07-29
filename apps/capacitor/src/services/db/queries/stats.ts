import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import {
	bucketMinutesByHour,
	buildWpmTrend,
	isPlausibleRate,
	type ReadingRates,
	rollUpWorks,
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
			durationMs: sql<number>`COALESCE(SUM(${readingSessions.durationMs}), 0)`.as("duration_ms"),
			words: sql<number>`COALESCE(SUM(${readingSessions.wordsRead}), 0)`.as("words"),
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
	/** Total length of the work; a serial sums its chapters. 0 when unknown. */
	wordCount: number;
	/** Overall position in the work, independent of the selected period. */
	wordPosition: number;
	coverImage: string | null;
}

export async function getTopBooks(opts: { since: number; limit?: number }): Promise<TopBook[]> {
	const limit = opts.limit ?? 5;
	// Aggregated per book in SQL, then rolled up per work in JS: a serial's rank
	// is only known after its chapters are folded, so a SQL LIMIT would truncate
	// before the ranking exists. Cost is one row per book read in the window.
	const rows = await db
		.select({
			bookId: readingSessions.bookId,
			seriesId: books.seriesId,
			title: books.title,
			author: books.author,
			wordCount: books.wordCount,
			wordPosition: books.wordPosition,
			durationMs: sql<number>`SUM(${readingSessions.durationMs})`.as("duration_ms"),
		})
		.from(readingSessions)
		.innerJoin(books, eq(books.id, readingSessions.bookId))
		.where(and(gte(readingSessions.startedAt, opts.since), eq(books.deleted, false)))
		.groupBy(
			readingSessions.bookId,
			books.seriesId,
			books.title,
			books.author,
			books.wordCount,
			books.wordPosition,
		);

	const works = rollUpWorks(rows).slice(0, limit);
	if (works.length === 0) return [];

	const seriesIds = works.filter((w) => w.isSeries).map((w) => w.workId);
	const standaloneIds = works.filter((w) => !w.isSeries).map((w) => w.workId);

	const [seriesRows, chapterTotals, coverRows] = await Promise.all([
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
					.select({
						seriesId: books.seriesId,
						wordCount: sql<number>`SUM(${books.wordCount})`.as("word_count"),
						wordPosition: sql<number>`SUM(${books.wordPosition})`.as("word_position"),
					})
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

	const seriesMap = new Map(seriesRows.map((entry) => [entry.id, entry]));
	const chapterWords = new Map(chapterTotals.map((c) => [c.seriesId, Number(c.wordCount)]));
	const chapterRead = new Map(chapterTotals.map((c) => [c.seriesId, Number(c.wordPosition)]));
	const coverMap = new Map(coverRows.map((c) => [c.bookId, c.coverImage]));

	return works.map((w) => {
		const entry = w.isSeries ? seriesMap.get(w.workId) : undefined;
		return {
			workId: w.workId,
			isSeries: w.isSeries,
			// A series row can be missing if the chapters outlived their series;
			// the chapter title is a better fallback than dropping the entry.
			title: entry?.title ?? w.title,
			author: entry?.author ?? w.author,
			durationMs: w.durationMs,
			wordCount: w.isSeries ? (chapterWords.get(w.workId) ?? 0) : w.wordCount,
			wordPosition: w.isSeries ? (chapterRead.get(w.workId) ?? 0) : w.wordPosition,
			coverImage: w.isSeries ? (entry?.coverImage ?? null) : (coverMap.get(w.workId) ?? null),
		};
	});
}

export async function getWpmTrend(opts: { period: TrendPeriod; now: number }): Promise<WpmTrend> {
	const now = opts.now;
	// All-time granularity depends on how far back the history goes, so ask the
	// cheapest possible question first rather than fetching every row to find out.
	const oldest =
		opts.period === "all"
			? await db
					.select({ startedAt: sql<number>`MIN(${readingSessions.startedAt})`.as("started_at") })
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
	/** Weight for bucketing; see `bucketSpeedSeries`. */
	words: number;
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
		// Totals above are unconditional; only the derived rate is gated, so a
		// position jump still counts as time spent and words covered.
		if (isPlausibleRate(r.wordsRead, r.durationMs)) {
			sumWords += r.wordsRead;
			sumActiveMs += r.durationMs;
			wordsByMode.set(r.mode, (wordsByMode.get(r.mode) ?? 0) + r.wordsRead);
			speedSeries.push({
				startedAt: r.startedAt,
				mode: r.mode,
				wpm: Math.round(r.wordsRead / (r.durationMs / 60_000)),
				words: r.wordsRead,
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
