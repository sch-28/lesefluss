import type { SyncBookmark } from "@lesefluss/core";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { DbExecutor } from "~/db";
import { type NewSyncBookmark, syncBookmarks, syncBooks } from "~/db/schema";

// 8 bound columns per row stays far under Postgres' 65535 parameters.
const CHUNK_SIZE = 1000;

/**
 * Last-write-wins upsert of pushed bookmarks. A tombstone is final: no push,
 * however new its stamp, brings a deleted bookmark back, since a device that
 * has not pulled the delete yet still holds it live. A bookmark is never
 * tombstoned for being absent from a push.
 *
 * Not clamped to server time, for the reason given at `goalInsertValues`.
 */
export async function upsertSyncBookmarks(
	exec: DbExecutor,
	userId: string,
	bookmarks: SyncBookmark[],
): Promise<void> {
	const byId = new Map<string, SyncBookmark>();
	for (const b of bookmarks) {
		const seen = byId.get(b.bookmarkId);
		if (!seen || b.deleted || (!seen.deleted && b.updatedAt > seen.updatedAt)) {
			byId.set(b.bookmarkId, b);
		}
	}
	const rows = [...byId.values()].map((b) => bookmarkInsertValues(userId, b));
	for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
		await exec
			.insert(syncBookmarks)
			.values(rows.slice(i, i + CHUNK_SIZE))
			.onConflictDoUpdate({
				target: [syncBookmarks.userId, syncBookmarks.bookmarkId],
				set: {
					bookId: sql`excluded.book_id`,
					word: sql`excluded.word`,
					label: sql`excluded.label`,
					deleted: sql`excluded.deleted`,
					createdAt: sql`excluded.created_at`,
					updatedAt: sql`GREATEST(excluded.updated_at, sync_bookmarks.updated_at)`,
				},
				setWhere: sql`sync_bookmarks.deleted = false AND (excluded.deleted OR excluded.updated_at > sync_bookmarks.updated_at)`,
			});
	}
}

/**
 * Tombstones the live bookmarks of every deleted book in the account. The
 * deleting device may never push its own bookmark tombstones (a series delete
 * drops chapter rows without any), so other devices learn of it from here.
 */
export async function tombstoneBookmarksOfDeletedBooks(
	exec: DbExecutor,
	userId: string,
): Promise<void> {
	await exec
		.update(syncBookmarks)
		.set({ deleted: true, updatedAt: new Date() })
		.where(
			and(
				eq(syncBookmarks.userId, userId),
				eq(syncBookmarks.deleted, false),
				inArray(
					syncBookmarks.bookId,
					exec
						.select({ bookId: syncBooks.bookId })
						.from(syncBooks)
						.where(and(eq(syncBooks.userId, userId), eq(syncBooks.deleted, true))),
				),
			),
		);
}

function bookmarkInsertValues(userId: string, b: SyncBookmark): NewSyncBookmark {
	return {
		userId,
		bookmarkId: b.bookmarkId,
		bookId: b.bookId,
		word: b.word,
		label: b.label,
		deleted: b.deleted,
		createdAt: new Date(b.createdAt),
		updatedAt: new Date(b.updatedAt),
	};
}
