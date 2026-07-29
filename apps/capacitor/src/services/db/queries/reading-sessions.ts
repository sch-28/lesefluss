import { desc, eq, gte, sql } from "drizzle-orm";
import { db } from "../index";
import { type NewReadingSession, type ReadingSession, readingSessions } from "../schema";

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
 * Insert-or-update used by sync pull. Last-write-wins on `updatedAt`:
 * if a row with the same id exists and the local row is newer, leaves it alone.
 */
export async function upsertReadingSession(session: NewReadingSession): Promise<void> {
	const existing = await db
		.select()
		.from(readingSessions)
		.where(eq(readingSessions.id, session.id))
		.limit(1);
	const local = existing[0];
	if (!local) {
		await db.insert(readingSessions).values(session);
		return;
	}
	if (session.updatedAt > local.updatedAt) {
		await db.update(readingSessions).set(session).where(eq(readingSessions.id, session.id));
	}
}

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
