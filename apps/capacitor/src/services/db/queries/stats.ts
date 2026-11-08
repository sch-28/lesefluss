import {
	bookSpeeds,
	bookStatus,
	computeSpeedModel,
	deriveMilestones,
	isMeasurableSitting,
	type MeasuredReadingMode,
	type Milestones,
	readingProgress,
	rollUpWorks,
	type SpeedModel,
	type SpeedWindow,
	speedWindowRows,
	THIRTY_DAYS_MS,
	wordPos,
} from "@lesefluss/core";
import { and, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { formatShortDate } from "../../../utils/date-utils";
import {
	bucketMinutesByHour,
	buildWpmTrend,
	readDaysOf,
	readingDaysOfSitting,
	type StreakResult,
	sumDurationByLocalDay,
	summariseStreak,
	type TrendTestMarker,
	trendTestMarkers,
	type WpmTrend,
	windowTrendBuckets,
} from "../../stats/aggregate";
import type { DailyReading } from "../../stats/calendar";
import { type Insight, speedInsights } from "../../stats/insights";
import { type ReadingRecords, summariseRecords } from "../../stats/records";
import { buildSpeedTabData, type SpeedTabData } from "../../stats/speed-tab";
import { db } from "../index";
import { bookContent, books, readingSessions, series } from "../schema";
import { getLatestPlausibleSpeedTest, getSpeedTests } from "./speed-tests";

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
			count: sql<number>`COUNT(*)`.as("count"),
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
	// Every session: "longest streak" is all-time.
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

export interface ShelfBook {
	id: string;
	title: string;
	author: string | null;
	coverImage: string | null;
	/** One line of context under the cover, already formatted for display. */
	detail: string;
	/** Progress bar over the cover. Absent where progress is not the point. */
	percent?: number;
	/** Where tapping goes. Carried per item because a rolled-up serial belongs on
	 *  the series route, not the book route. */
	href: string;
}

const CURRENTLY_READING_LIMIT = 10;

/**
 * Books the reader is in the middle of: started, not finished, most recently
 * read first. Serial chapters are excluded because a chapter is not a book the
 * reader would say they are "currently reading".
 */
export async function getCurrentlyReading(): Promise<ShelfBook[]> {
	const rows = await db
		.select({
			id: books.id,
			title: books.title,
			author: books.author,
			wordCount: books.wordCount,
			wordPosition: books.wordPosition,
			lastRead: books.lastRead,
		})
		.from(books)
		.where(
			and(
				eq(books.deleted, false),
				isNull(books.seriesId),
				isNull(books.finishedAt),
				gt(books.wordPosition, wordPos(0)),
			),
		)
		.orderBy(desc(books.lastRead))
		.limit(CURRENTLY_READING_LIMIT);

	const covers = await coversFor(rows.map((row) => row.id));
	return rows.map((row) => {
		const percent = readingProgress(row);
		return {
			id: row.id,
			title: row.title,
			author: row.author,
			coverImage: covers.get(row.id) ?? null,
			detail: `${percent}% read`,
			percent,
			href: `/tabs/library/book/${row.id}`,
		};
	});
}

/** Rows on the finished shelf. The count in its subtitle comes from a separate
 *  COUNT so it reports the library, not the page size. */
const FINISHED_SHELF_LIMIT = 20;

export interface FinishedBooks {
	books: ShelfBook[];
	total: number;
}

/** Books that crossed the finished threshold, most recently finished first. */
export async function getFinishedBooks(): Promise<FinishedBooks> {
	const rows = await db
		.select({
			id: books.id,
			title: books.title,
			author: books.author,
			finishedAt: books.finishedAt,
		})
		.from(books)
		.where(and(eq(books.deleted, false), isNull(books.seriesId), isNotNull(books.finishedAt)))
		.orderBy(desc(books.finishedAt))
		.limit(FINISHED_SHELF_LIMIT);

	const totalRow = await db
		.select({ count: sql<number>`COUNT(*)`.as("count") })
		.from(books)
		.where(and(eq(books.deleted, false), isNull(books.seriesId), isNotNull(books.finishedAt)));

	const covers = await coversFor(rows.map((row) => row.id));
	const shelf = rows.map((row) => ({
		id: row.id,
		title: row.title,
		author: row.author,
		coverImage: covers.get(row.id) ?? null,
		detail: row.finishedAt != null ? formatShortDate(row.finishedAt) : "",
		href: `/tabs/library/book/${row.id}`,
	}));

	return { books: shelf, total: Number(totalRow[0]?.count ?? shelf.length) };
}

async function coversFor(ids: string[]): Promise<Map<string, string | null>> {
	if (ids.length === 0) return new Map();
	const rows = await db
		.select({ bookId: bookContent.bookId, coverImage: bookContent.coverImage })
		.from(bookContent)
		.where(inArray(bookContent.bookId, ids));
	return new Map(rows.map((row) => [row.bookId, row.coverImage]));
}

/**
 * Active milliseconds per local day and the days that count toward the streak,
 * all time, keyed `YYYY-MM-DD`.
 *
 * All time rather than a window: the streak calendar pages through history, and
 * a window would make older months silently empty. One scan feeds every month.
 */
export async function getDailyReading(): Promise<DailyReading> {
	const rows = await db
		.select({ startedAt: readingSessions.startedAt, durationMs: readingSessions.durationMs })
		.from(readingSessions);
	return { msByDay: sumDurationByLocalDay(rows), readDays: readDaysOf(rows) };
}

/**
 * Personal bests over the whole history.
 *
 * Unbounded like `getStreak` and `getHourHistogram`, which already read every
 * session for the same reason: a record is by definition all-time, so a window
 * would silently cap it.
 */
export async function getReadingRecords(): Promise<ReadingRecords> {
	const [sessions, bookRows] = await Promise.all([
		db
			.select({
				bookId: readingSessions.bookId,
				mode: readingSessions.mode,
				startedAt: readingSessions.startedAt,
				durationMs: readingSessions.durationMs,
				wordsRead: readingSessions.wordsRead,
			})
			.from(readingSessions)
			// Ordered so ties resolve to the earliest record-setting sitting rather
			// than to whatever the storage engine returns first.
			.orderBy(readingSessions.startedAt),
		db
			.select({
				id: books.id,
				title: books.title,
				wordCount: books.wordCount,
				finishedAt: books.finishedAt,
				seriesId: books.seriesId,
			})
			.from(books)
			.where(eq(books.deleted, false))
			// Ordered so a tie between two equally long books resolves the same way
			// on every render rather than however the storage engine returns them.
			.orderBy(books.addedAt),
	]);

	return summariseRecords(sessions, bookRows);
}

export async function getSpeedTab(): Promise<SpeedTabData> {
	const [sessions, bookRows] = await Promise.all([
		db
			.select({
				bookId: readingSessions.bookId,
				mode: readingSessions.mode,
				startedAt: readingSessions.startedAt,
				durationMs: readingSessions.durationMs,
				wordsRead: readingSessions.wordsRead,
				wpmAvg: readingSessions.wpmAvg,
			})
			.from(readingSessions)
			// Ordered so a tied record goes to the earlier sitting on every render.
			.orderBy(readingSessions.startedAt),
		db.select({ id: books.id, title: books.title }).from(books).where(eq(books.deleted, false)),
	]);
	const covers = await coversFor(bookRows.map((b) => b.id));
	const byId = new Map(
		bookRows.map((b) => [b.id, { title: b.title, coverImage: covers.get(b.id) ?? null }]),
	);
	return buildSpeedTabData(sessions, byId);
}

export type SpeedTrendMode = "reading" | "rsvp";

export type SpeedTrend = WpmTrend & { tests: TrendTestMarker[] };

/** One mode's speed over the sittings the speed model's window holds, so the
 *  line and the number above it come from the same rows. Speed tests ride along
 *  as markers; the 30-day and all-time charts stretch to hold them. */
export async function getWpmTrend(opts: {
	window: SpeedWindow;
	mode: SpeedTrendMode;
	now: number;
}): Promise<SpeedTrend> {
	const [rows, tests] = await Promise.all([
		db
			.select({
				startedAt: readingSessions.startedAt,
				mode: readingSessions.mode,
				wpmAvg: readingSessions.wpmAvg,
				wordsRead: readingSessions.wordsRead,
				durationMs: readingSessions.durationMs,
			})
			.from(readingSessions),
		getSpeedTests(),
	]);
	const inWindow = speedWindowRows(rows, opts.window, opts.now);
	const ofMode = inWindow.filter((r) => (opts.mode === "rsvp") === (r.mode === "rsvp"));
	let oldest: number | undefined;
	for (const r of inWindow) if (oldest === undefined || r.startedAt < oldest) oldest = r.startedAt;
	const testsFrom =
		opts.window === "all"
			? 0
			: opts.window === "30d"
				? opts.now - THIRTY_DAYS_MS
				: Number.POSITIVE_INFINITY;
	for (const t of tests) {
		if (t.createdAt >= testsFrom && (oldest === undefined || t.createdAt < oldest)) {
			oldest = t.createdAt;
		}
	}
	const buckets = windowTrendBuckets(opts.window, oldest, opts.now);
	const trend = buildWpmTrend(
		ofMode.map((r) => ({ ...r, words: r.wordsRead })),
		buckets,
	);
	const testWpm = tests.map((t) => ({
		takenAt: t.createdAt,
		wpm: opts.mode === "rsvp" ? t.rsvpWpm : t.readingWpm,
	}));
	return { ...trend, tests: trendTestMarkers(testWpm, buckets.starts) };
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
	mode: MeasuredReadingMode;
	wpm: number;
	/** Weight for bucketing; see `bucketSpeedSeries`. */
	words: number;
}

export interface BookStats {
	totalDurationMs: number;
	sessionCount: number;
	lastReadAt: number | null;
	/** First recorded sitting. Null when nothing has been read. */
	firstReadAt: number | null;
	/** The single longest sitting, for the journey summary. */
	longestSessionMs: number;
	longestSessionAt: number | null;
	/** The book's own speed from the speed model, and the mode with most of its words. */
	measuredWpm: number | null;
	dominantMode: MeasuredReadingMode | null;
	speedSeries: SpeedPoint[];
}

/** Every session row: the window is chosen inside the model, and a book's own
 *  speed spans all of its history. The latest speed test stands in until the
 *  window holds enough reading. */
export async function getSpeedModel(opts: {
	window: SpeedWindow;
	now: number;
	/** Sittings to leave out, for a speed as it stood before them. */
	without?: readonly string[];
}): Promise<SpeedModel> {
	const [all, test] = await Promise.all([
		db
			.select({
				id: readingSessions.id,
				bookId: readingSessions.bookId,
				mode: readingSessions.mode,
				startedAt: readingSessions.startedAt,
				durationMs: readingSessions.durationMs,
				wordsRead: readingSessions.wordsRead,
				wpmAvg: readingSessions.wpmAvg,
			})
			.from(readingSessions),
		getLatestPlausibleSpeedTest(),
	]);
	const without = new Set(opts.without);
	const rows = without.size > 0 ? all.filter((r) => !without.has(r.id)) : all;
	const speedTest = test ? { wpm: test.readingWpm, takenAt: test.createdAt } : null;
	return computeSpeedModel(rows, { window: opts.window, now: opts.now, speedTest });
}

export type SpeedInsights = { reading: Insight[]; rsvp: Insight[] };

/** The Speed tab's insight tiles for both views, over the sittings in the window. */
export async function getSpeedInsights(opts: {
	window: SpeedWindow;
	now: number;
}): Promise<SpeedInsights> {
	const all = await db
		.select({
			mode: readingSessions.mode,
			startedAt: readingSessions.startedAt,
			durationMs: readingSessions.durationMs,
			wordsRead: readingSessions.wordsRead,
			wpmAvg: readingSessions.wpmAvg,
			fontSize: readingSessions.fontSize,
			segmentWpm: readingSessions.segmentWpm,
		})
		.from(readingSessions);
	const rows = speedWindowRows(all, opts.window, opts.now);
	return { reading: speedInsights(rows, "reading"), rsvp: speedInsights(rows, "rsvp") };
}

/**
 * Per-book aggregation. Single fetch ordered by startedAt; totals and averages
 * computed in JS off the same row set.
 */
export async function getBookStats(bookId: string): Promise<BookStats> {
	const rows = await db
		.select({
			bookId: readingSessions.bookId,
			startedAt: readingSessions.startedAt,
			mode: readingSessions.mode,
			durationMs: readingSessions.durationMs,
			wordsRead: readingSessions.wordsRead,
		})
		.from(readingSessions)
		.where(eq(readingSessions.bookId, bookId))
		.orderBy(readingSessions.startedAt);

	if (rows.length === 0) {
		return {
			totalDurationMs: 0,
			sessionCount: 0,
			lastReadAt: null,
			firstReadAt: null,
			longestSessionMs: 0,
			longestSessionAt: null,
			measuredWpm: null,
			dominantMode: null,
			speedSeries: [],
		};
	}

	let totalDurationMs = 0;
	let lastReadAt = 0;
	let longestSessionMs = 0;
	let longestSessionAt: number | null = null;
	const speedSeries: SpeedPoint[] = [];

	for (const r of rows) {
		totalDurationMs += r.durationMs;
		if (r.startedAt > lastReadAt) lastReadAt = r.startedAt;
		if (r.durationMs > longestSessionMs) {
			longestSessionMs = r.durationMs;
			longestSessionAt = r.startedAt;
		}
		// Totals above are unconditional; only the derived rate is gated, so a
		// position jump still counts as time spent and words covered.
		if (isMeasurableSitting(r)) {
			speedSeries.push({
				startedAt: r.startedAt,
				mode: r.mode,
				wpm: Math.round(r.wordsRead / (r.durationMs / 60_000)),
				words: r.wordsRead,
			});
		}
	}

	const speed = bookSpeeds(rows)[bookId];

	return {
		totalDurationMs,
		sessionCount: rows.length,
		lastReadAt,
		// Rows are ordered by startedAt, so the first is the earliest sitting.
		firstReadAt: rows[0]?.startedAt ?? null,
		longestSessionMs,
		longestSessionAt,
		measuredWpm: speed?.wpm ?? null,
		dominantMode: speed?.mode ?? null,
		speedSeries,
	};
}

/** Milestones over every sitting and every finished book; serial chapters don't count as books. */
export async function getMilestones(): Promise<Milestones> {
	const [sessions, finished] = await Promise.all([
		db
			.select({
				mode: readingSessions.mode,
				startedAt: readingSessions.startedAt,
				durationMs: readingSessions.durationMs,
				wordsRead: readingSessions.wordsRead,
			})
			.from(readingSessions),
		db
			.select({
				wordCount: books.wordCount,
				wordPosition: books.wordPosition,
				status: books.status,
				finishedAt: books.finishedAt,
			})
			.from(books)
			.where(and(eq(books.deleted, false), isNull(books.seriesId), isNotNull(books.finishedAt))),
	]);
	return deriveMilestones({
		sessions,
		finishedAt: finished.filter((b) => bookStatus(b) === "finished").map((b) => b.finishedAt ?? 0),
		dayKeysOf: readingDaysOfSitting,
	});
}
