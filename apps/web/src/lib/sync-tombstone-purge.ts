import { and, count, eq, isNull, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { z } from "zod";
import type { Db, Tx } from "~/db";
import { syncBookmarks, syncBooks, syncHighlights, syncWishlist } from "~/db/schema";
import { NO_TOMBSTONES, type TombstoneCounts, type UserTombstoneCounts } from "./tombstone-counts";

// An empty id must not widen a one-user purge to everyone.
export const TombstoneScopeSchema = z.object({ userId: z.string().min(1).optional() });

function tombstonesOf(deleted: PgColumn, userIdColumn: PgColumn, userId?: string): SQL {
	const isTombstone = eq(deleted, true);
	return (userId !== undefined ? and(isTombstone, eq(userIdColumn, userId)) : isTombstone) as SQL;
}

/** The rows the purge removes, shared with the count so the confirm matches what goes. */
function purgeable(userId?: string): Record<keyof TombstoneCounts, SQL> {
	return {
		books: and(
			tombstonesOf(syncBooks.deleted, syncBooks.userId, userId),
			isNull(syncBooks.seriesId),
		) as SQL,
		highlights: tombstonesOf(syncHighlights.deleted, syncHighlights.userId, userId),
		bookmarks: tombstonesOf(syncBookmarks.deleted, syncBookmarks.userId, userId),
		wishlist: tombstonesOf(syncWishlist.deleted, syncWishlist.userId, userId),
	};
}

/**
 * Hard-deletes tombstoned standalone books, highlights, bookmarks and wishlist
 * items, for one user or everyone. Live rows are never touched. Chapter
 * tombstones belong to their series and are purged with it.
 */
export async function purgeBookTombstones(tx: Tx, userId?: string) {
	const where = purgeable(userId);
	const removedBooks = await tx
		.delete(syncBooks)
		.where(where.books)
		.returning({ bookId: syncBooks.bookId });
	const removedHighlights = await tx
		.delete(syncHighlights)
		.where(where.highlights)
		.returning({ highlightId: syncHighlights.highlightId });
	const removedBookmarks = await tx
		.delete(syncBookmarks)
		.where(where.bookmarks)
		.returning({ bookmarkId: syncBookmarks.bookmarkId });
	const removedWishlist = await tx
		.delete(syncWishlist)
		.where(where.wishlist)
		.returning({ itemId: syncWishlist.itemId });
	return {
		booksRemoved: removedBooks.length,
		highlightsRemoved: removedHighlights.length,
		bookmarksRemoved: removedBookmarks.length,
		wishlistRemoved: removedWishlist.length,
	};
}

/** What `purgeBookTombstones` would remove, per user and kind; users without any are left out. */
export async function countPurgeableTombstones(
	db: Db,
	userId?: string,
): Promise<UserTombstoneCounts[]> {
	const where = purgeable(userId);
	const [books, highlights, bookmarks, wishlist] = await Promise.all([
		db
			.select({ userId: syncBooks.userId, count: count() })
			.from(syncBooks)
			.where(where.books)
			.groupBy(syncBooks.userId),
		db
			.select({ userId: syncHighlights.userId, count: count() })
			.from(syncHighlights)
			.where(where.highlights)
			.groupBy(syncHighlights.userId),
		db
			.select({ userId: syncBookmarks.userId, count: count() })
			.from(syncBookmarks)
			.where(where.bookmarks)
			.groupBy(syncBookmarks.userId),
		db
			.select({ userId: syncWishlist.userId, count: count() })
			.from(syncWishlist)
			.where(where.wishlist)
			.groupBy(syncWishlist.userId),
	]);
	const byUser = new Map<string, UserTombstoneCounts>();
	const add = (kind: keyof TombstoneCounts, rows: { userId: string; count: number }[]) => {
		for (const row of rows) {
			const entry = byUser.get(row.userId) ?? { userId: row.userId, ...NO_TOMBSTONES };
			entry[kind] = row.count;
			byUser.set(row.userId, entry);
		}
	};
	add("books", books);
	add("highlights", highlights);
	add("bookmarks", bookmarks);
	add("wishlist", wishlist);
	return [...byUser.values()];
}
