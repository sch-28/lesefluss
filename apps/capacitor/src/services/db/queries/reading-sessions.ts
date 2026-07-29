import { desc, eq, gte, lt, sql } from "drizzle-orm";

import { db } from "../index";
import { type NewReadingSession, type ReadingSession, readingSessions } from "../schema";

// Same bound as series.ts: stay under SQLite's SQLITE_MAX_VARIABLE_NUMBER (32766).
// 200 rows x 11 cols is comfortably inside it.
const UPSERT_CHUNK_SIZE = 200;

/**
 * Fetch all reading sessions across all books. Used by sync push and stats UI.
 * Append-only: sessions are never edited or deleted from the UI.
 */
export async function getAllReadingSessions(): Promise<ReadingSession[]> {
	return db.select().from(readingSessions).orderBy(desc(readingSessions.startedAt));
}

/** Newest-first page of sessions, optionally for one book. */
export async function getReadingSessionsPage(opts: {
	limit: number;
	bookId?: string;
}): Promise<ReadingSession[]> {
	const base = db.select().from(readingSessions);
	const scoped = opts.bookId ? base.where(eq(readingSessions.bookId, opts.bookId)) : base;
	return scoped.orderBy(desc(readingSessions.startedAt)).limit(opts.limit);
}

export async function countReadingSessions(bookId?: string): Promise<number> {
	const base = db.select({ count: sql<number>`COUNT(*)` }).from(readingSessions);
	const scoped = bookId ? base.where(eq(readingSessions.bookId, bookId)) : base;
	const row = await scoped;
	return Number(row[0]?.count ?? 0);
}

/**
 * Fetch sessions touched at or after `sinceMs`. Sync pushes only these: the server
 * upserts sessions and never tombstones omitted rows, so a partial set is safe and
 * keeps a push from re-sending a reading history that only ever grows.
 *
 * `>=` rather than `>` so a row sharing a millisecond with the watermark can't slip
 * through. The server-side upsert is idempotent, so the overlap costs nothing.
 */
export async function getReadingSessionsSince(sinceMs: number): Promise<ReadingSession[]> {
	if (sinceMs <= 0) return getAllReadingSessions();
	return db
		.select()
		.from(readingSessions)
		.where(gte(readingSessions.updatedAt, sinceMs))
		.orderBy(desc(readingSessions.startedAt));
}

/**
 * Insert a new reading session. Caller generates the id.
 */
export async function addReadingSession(session: NewReadingSession): Promise<void> {
	await db.insert(readingSessions).values(session);
}

/**
 * Insert-or-update used by the reader's checkpoints and by sync pull.
 * Last-write-wins on `updatedAt`.
 *
 * Single statement on purpose: a read-then-write let a heartbeat checkpoint and
 * a terminal flush for the same id both observe no row and both insert, losing
 * one write. Since the push watermark advances on `updatedAt`, a row left stale
 * that way is never selected again and stays local forever.
 */
export async function upsertReadingSession(session: NewReadingSession): Promise<void> {
	await db
		.insert(readingSessions)
		.values(session)
		.onConflictDoUpdate({
			target: readingSessions.id,
			set: session,
			where: lt(readingSessions.updatedAt, session.updatedAt),
		});
}

/**
 * Batched last-write-wins upsert, used by sync pull. One statement per chunk
 * rather than per row: the pull is unbounded, and every statement is a Capacitor
 * bridge round-trip.
 */
export async function upsertReadingSessions(sessions: NewReadingSession[]): Promise<void> {
	for (let i = 0; i < sessions.length; i += UPSERT_CHUNK_SIZE) {
		const chunk = sessions.slice(i, i + UPSERT_CHUNK_SIZE);
		await db
			.insert(readingSessions)
			.values(chunk)
			.onConflictDoUpdate({
				target: readingSessions.id,
				set: EXCLUDED_SESSION_COLUMNS,
				where: lt(readingSessions.updatedAt, sql`excluded.updated_at`),
			});
	}
}

/** Every column taken from the incoming row, so a chunk of differing rows each
 *  update to their own values rather than to one shared literal. */
const EXCLUDED_SESSION_COLUMNS = {
	bookId: sql`excluded.book_id`,
	mode: sql`excluded.mode`,
	startedAt: sql`excluded.started_at`,
	endedAt: sql`excluded.ended_at`,
	durationMs: sql`excluded.duration_ms`,
	wordsRead: sql`excluded.words_read`,
	startWord: sql`excluded.start_word`,
	endWord: sql`excluded.end_word`,
	wpmAvg: sql`excluded.wpm_avg`,
	updatedAt: sql`excluded.updated_at`,
};

/**
 * Hard-delete every reading session row locally. Sessions are append-only and
 * have no tombstone column, so the danger-zone flow pairs this with a server
 * wipe call to keep cloud + local in sync.
 */
export async function deleteAllReadingSessions(): Promise<void> {
	await db.delete(readingSessions);
}

/**
 * Hard-delete a single reading session by id. Pairs with a server-side delete
 * call so the next sync pull does not re-create the row (sessions have no
 * tombstone column).
 */
export async function deleteReadingSession(id: string): Promise<void> {
	await db.delete(readingSessions).where(eq(readingSessions.id, id));
}
