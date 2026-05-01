import { desc, eq } from "drizzle-orm";
import { db } from "../index";
import { type NewReadingSession, type ReadingSession, readingSessions } from "../schema";

/**
 * Fetch all reading sessions across all books. Used by sync push and stats UI.
 * Append-only: sessions are never edited or deleted from the UI.
 */
export async function getAllReadingSessions(): Promise<ReadingSession[]> {
	return db.select().from(readingSessions).orderBy(desc(readingSessions.startedAt));
}

/**
 * Fetch reading sessions for a single book (per-book stats card).
 */
export async function getReadingSessionsByBook(bookId: string): Promise<ReadingSession[]> {
	return db
		.select()
		.from(readingSessions)
		.where(eq(readingSessions.bookId, bookId))
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
