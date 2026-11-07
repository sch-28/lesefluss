import { and, eq, isNull, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { z } from "zod";
import type { Tx } from "~/db";
import { syncBookmarks, syncBooks, syncHighlights } from "~/db/schema";

// An empty id must not widen a one-user purge to everyone.
export const TombstoneScopeSchema = z.object({ userId: z.string().min(1).optional() });

function tombstonesOf(deleted: PgColumn, userIdColumn: PgColumn, userId?: string): SQL {
	const isTombstone = eq(deleted, true);
	return (userId !== undefined ? and(isTombstone, eq(userIdColumn, userId)) : isTombstone) as SQL;
}

/**
 * Hard-deletes tombstoned standalone books, highlights and bookmarks, for one
 * user or everyone. Live rows are never touched. Chapter tombstones belong to
 * their series and are purged with it.
 */
export async function purgeBookTombstones(tx: Tx, userId?: string) {
	const removedBooks = await tx
		.delete(syncBooks)
		.where(
			and(tombstonesOf(syncBooks.deleted, syncBooks.userId, userId), isNull(syncBooks.seriesId)),
		)
		.returning({ bookId: syncBooks.bookId });
	const removedHighlights = await tx
		.delete(syncHighlights)
		.where(tombstonesOf(syncHighlights.deleted, syncHighlights.userId, userId))
		.returning({ highlightId: syncHighlights.highlightId });
	const removedBookmarks = await tx
		.delete(syncBookmarks)
		.where(tombstonesOf(syncBookmarks.deleted, syncBookmarks.userId, userId))
		.returning({ bookmarkId: syncBookmarks.bookmarkId });
	return {
		booksRemoved: removedBooks.length,
		highlightsRemoved: removedHighlights.length,
		bookmarksRemoved: removedBookmarks.length,
	};
}
