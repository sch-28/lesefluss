import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "../index";
import {
	type Book,
	bookContent,
	books,
	type NewBook,
	type NewSeries,
	type Series,
	series,
} from "../schema";

export async function getSeries(id: string): Promise<Series | undefined> {
	const rows = await db.select().from(series).where(eq(series.id, id));
	return rows[0];
}

export async function getSeriesList(): Promise<Series[]> {
	return db.select().from(series).where(eq(series.deleted, false));
}

/** All series including tombstones — for sync push. */
export async function getSeriesForSync(): Promise<Series[]> {
	return db.select().from(series);
}

export async function addSeries(row: NewSeries): Promise<string> {
	await db.insert(series).values(row);
	return row.id;
}

/**
 * Insert a series row plus N pending chapter rows. Three batched INSERTs
 * (series, books, book_content) — replaces 1 + 2N round trips.
 *
 * NOT wrapped in an explicit transaction: the drizzle sqlite-proxy adapter
 * auto-commits each `run()`, and SQLite refuses nested transactions, so an
 * outer BEGIN/COMMIT here would fail with "cannot start a transaction
 * within a transaction".
 *
 * The atomicity loss is bounded — by the time this runs, the network work
 * (`fetchSeriesMetadata` + `fetchChapterList`) is already complete, so the
 * three DB writes only fail on disk pressure / lock contention. A partial
 * write would leave an orphan series row; a re-import attempt would collide
 * on the random 4-byte id (vanishingly unlikely) or succeed cleanly with a
 * fresh id. Acceptable trade-off for now; revisit if drizzle's adapter
 * grows real transaction support.
 */
export async function addSeriesWithChapters(
	seriesRow: NewSeries,
	chapterRows: NewBook[],
): Promise<void> {
	await db.insert(series).values(seriesRow);
	if (chapterRows.length === 0) return;

	// Chunk bulk inserts. A long serial (e.g. a 2000-chapter web novel) would
	// otherwise build one huge VALUES clause: drizzle's parameter spread blows
	// the JS call stack ("Maximum call stack size exceeded") around a few
	// thousand args, and SQLite's SQLITE_MAX_VARIABLE_NUMBER (32766 default)
	// caps params per statement regardless. 200 rows × ~16 cols ≈ 3200 vars
	// keeps both limits comfortable and is small enough that any future
	// schema widening doesn't push us back over the line.
	const CHUNK = 200;
	for (let i = 0; i < chapterRows.length; i += CHUNK) {
		await db.insert(books).values(chapterRows.slice(i, i + CHUNK));
	}
	const contentRows = chapterRows.map((b) => ({
		bookId: b.id,
		content: "",
		coverImage: null,
		chapters: null,
	}));
	for (let i = 0; i < contentRows.length; i += CHUNK) {
		await db.insert(bookContent).values(contentRows.slice(i, i + CHUNK));
	}
}

export async function updateSeries(
	id: string,
	data: Partial<Omit<NewSeries, "id">>,
): Promise<void> {
	await db.update(series).set(data).where(eq(series.id, id));
}

/**
 * Soft-delete a series and tombstone all of its chapter rows.
 * Mirrors `deleteBook` semantics — bumps updatedAt so the tombstone pushes on next sync.
 */
export async function deleteSeries(id: string): Promise<void> {
	const now = Date.now();
	await db
		.update(books)
		.set({ deleted: true, isActive: false, lastRead: now })
		.where(eq(books.seriesId, id));
	await db.update(series).set({ deleted: true, updatedAt: now }).where(eq(series.id, id));
}

/** Hard-delete a series row — used by sync pull when the server reports a tombstone. */
export async function hardDeleteSeries(id: string): Promise<void> {
	await db.delete(series).where(eq(series.id, id));
}

/**
 * Replace the content of a chapter row in `book_content`. Used by lazy chapter
 * fetch — `addSeriesWithChapters` inserts a placeholder; this swaps it for the
 * real text once the scraper resolves.
 */
export async function setChapterContent(bookId: string, content: string): Promise<void> {
	await db.update(bookContent).set({ content }).where(eq(bookContent.bookId, bookId));
}

/**
 * Chapter counts for every series in one query. Used by the library grid to
 * render the "N chapters" badge without N+1 round trips. Returns a `Map` so
 * cards that aren't covered (zero chapters — shouldn't happen post-import)
 * fall back to `undefined` cleanly.
 */
export async function getSeriesChapterCounts(): Promise<Map<string, number>> {
	const rows = await db
		.select({
			seriesId: books.seriesId,
			count: sql<number>`COUNT(*)`,
		})
		.from(books)
		.where(and(isNotNull(books.seriesId), eq(books.deleted, false)))
		.groupBy(books.seriesId);

	const map = new Map<string, number>();
	for (const r of rows) {
		if (r.seriesId) map.set(r.seriesId, Number(r.count));
	}
	return map;
}

/** Ordered chapter rows (books) for a given series. */
export async function getSeriesChapters(seriesId: string): Promise<Book[]> {
	return db
		.select()
		.from(books)
		.where(and(eq(books.seriesId, seriesId), eq(books.deleted, false)))
		.orderBy(asc(books.chapterIndex));
}

/**
 * Pick the chapter to open when the user taps a series card: the most recently
 * read chapter, or the first chapter (`chapter_index = 0`) for a new series.
 *
 * SQLite sorts NULLs first by default in ascending order; in DESC order they
 * sort last — exactly the "fall back to oldest unread" behavior we want.
 */
export async function getSeriesEntryChapter(seriesId: string): Promise<Book | undefined> {
	const rows = await db
		.select()
		.from(books)
		.where(and(eq(books.seriesId, seriesId), eq(books.deleted, false)))
		.orderBy(desc(books.lastRead), asc(books.chapterIndex))
		.limit(1);
	return rows[0];
}

/**
 * Insert new chapter rows (books + empty book_content placeholders) for a
 * series. Mirrors the inner logic of `addSeriesWithChapters` but without the
 * series INSERT — used when polling discovers chapters not yet in the DB.
 *
 * Drizzle's `.onConflictDoNothing()` makes this idempotent: calling it twice
 * with the same generated ids is safe (shouldn't happen, but belt-and-braces).
 */
export async function insertChapters(rows: NewBook[]): Promise<void> {
	if (rows.length === 0) return;
	await db.insert(books).values(rows).onConflictDoNothing();
	await db
		.insert(bookContent)
		.values(
			rows.map((b) => ({
				bookId: b.id,
				content: "",
				coverImage: null,
				chapters: null,
			})),
		)
		.onConflictDoNothing();
}

/**
 * Update the `chapterIndex` of an existing chapter row when upstream reorders
 * the TOC. Only called when the index has actually changed.
 */
export async function updateChapterIndex(bookId: string, newIndex: number): Promise<void> {
	await db.update(books).set({ chapterIndex: newIndex }).where(eq(books.id, bookId));
}

/**
 * The chapter immediately following `currentIndex` within a series, used by
 * the reader's auto-advance. Returns undefined when the user just finished
 * the last chapter.
 */
export async function getNextChapter(
	seriesId: string,
	currentIndex: number,
): Promise<Book | undefined> {
	const rows = await db
		.select()
		.from(books)
		.where(
			and(
				eq(books.seriesId, seriesId),
				eq(books.chapterIndex, currentIndex + 1),
				eq(books.deleted, false),
			),
		)
		.limit(1);
	return rows[0];
}

/**
 * The chapter immediately preceding `currentIndex` within a series, used by
 * the reader's manual prev navigation. Returns undefined at chapter 0.
 */
export async function getPreviousChapter(
	seriesId: string,
	currentIndex: number,
): Promise<Book | undefined> {
	if (currentIndex <= 0) return undefined;
	const rows = await db
		.select()
		.from(books)
		.where(
			and(
				eq(books.seriesId, seriesId),
				eq(books.chapterIndex, currentIndex - 1),
				eq(books.deleted, false),
			),
		)
		.limit(1);
	return rows[0];
}
