import { BOOKMARK_LABEL_MAX, type WordPosition } from "@lesefluss/core";
import { and, asc, between, eq, inArray, sql } from "drizzle-orm";
import { randomSessionId } from "../../../utils/random-id";
import { serverNow } from "../../sync/server-clock";
import { db } from "../index";
import { type Bookmark, bookmarks } from "../schema";

// 7 bound columns per row stays well under SQLite's 999 parameters.
const CHUNK_SIZE = 100;

export function normalizeBookmarkLabel(label: string | null | undefined): string | null {
	const trimmed = label?.trim().slice(0, BOOKMARK_LABEL_MAX) ?? "";
	return trimmed || null;
}

/** The book's bookmarks in reading order, without tombstones. */
export async function getBookmarksByBook(bookId: string): Promise<Bookmark[]> {
	return db
		.select()
		.from(bookmarks)
		.where(and(eq(bookmarks.bookId, bookId), eq(bookmarks.deleted, false)))
		.orderBy(asc(bookmarks.word), asc(bookmarks.createdAt), asc(bookmarks.id));
}

export async function addBookmark(
	input: { bookId: string; word: WordPosition; label?: string | null },
	now = serverNow(),
): Promise<Bookmark> {
	const row: Bookmark = {
		id: randomSessionId(),
		bookId: input.bookId,
		word: input.word,
		label: normalizeBookmarkLabel(input.label),
		deleted: false,
		createdAt: now,
		updatedAt: now,
	};
	await db.insert(bookmarks).values(row);
	return row;
}

/**
 * Removes the bookmarks on the visible words `from`..`to`, or adds one at `from`
 * when none is on screen. Returns the added row.
 */
export async function toggleBookmarkOnScreen(
	bookId: string,
	from: WordPosition,
	to: WordPosition,
	now = serverNow(),
): Promise<Bookmark | null> {
	const onScreen = and(
		eq(bookmarks.bookId, bookId),
		between(bookmarks.word, from, to),
		eq(bookmarks.deleted, false),
	);
	const existing = await db.select({ id: bookmarks.id }).from(bookmarks).where(onScreen).limit(1);
	if (existing.length > 0) {
		await db.update(bookmarks).set({ deleted: true, updatedAt: now }).where(onScreen);
		return null;
	}
	return addBookmark({ bookId, word: from }, now);
}

export async function renameBookmark(
	id: string,
	label: string | null,
	now = serverNow(),
): Promise<void> {
	await db
		.update(bookmarks)
		.set({ label: normalizeBookmarkLabel(label), updatedAt: now })
		.where(and(eq(bookmarks.id, id), eq(bookmarks.deleted, false)));
}

/** Tombstone, so the removal syncs. The pull hard-deletes it once the server agrees. */
export async function deleteBookmark(id: string, now = serverNow()): Promise<void> {
	await db
		.update(bookmarks)
		.set({ deleted: true, updatedAt: now })
		.where(and(eq(bookmarks.id, id), eq(bookmarks.deleted, false)));
}

/** Tombstones included: a push always resends them so deletes reach the server. */
export async function getAllBookmarksForSync(): Promise<Bookmark[]> {
	return db.select().from(bookmarks);
}

/** Last-write-wins on `updatedAt`. */
export async function upsertBookmarks(rows: Bookmark[]): Promise<void> {
	for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
		await db
			.insert(bookmarks)
			.values(rows.slice(i, i + CHUNK_SIZE))
			.onConflictDoUpdate({
				target: bookmarks.id,
				set: {
					bookId: sql`excluded.book_id`,
					word: sql`excluded.word`,
					label: sql`excluded.label`,
					deleted: sql`excluded.deleted`,
					createdAt: sql`excluded.created_at`,
					updatedAt: sql`excluded.updated_at`,
				},
				where: sql`${bookmarks.updatedAt} < excluded.updated_at`,
			});
	}
}

export async function hardDeleteBookmarks(ids: string[]): Promise<void> {
	for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
		await db.delete(bookmarks).where(inArray(bookmarks.id, ids.slice(i, i + CHUNK_SIZE)));
	}
}
