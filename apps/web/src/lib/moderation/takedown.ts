import { and, eq, inArray } from "drizzle-orm";
import { type DbExecutor, db, type Tx } from "~/db";
import { type SocialTakedown, socialTakedown, syncBooks, syncHighlights } from "~/db/schema";

export type TakedownScope = SocialTakedown["scope"];

/**
 * Soft-deletes one synced book so the tombstone reaches the owner's devices on
 * the next pull. Content columns are nulled to reclaim space; the row stays as
 * a sticky tombstone and the book's highlights are tombstoned with it.
 */
export async function tombstoneBook(
	tx: Tx,
	userId: string,
	bookId: string,
	now: Date,
): Promise<boolean> {
	const updated = await tx
		.update(syncBooks)
		.set({ deleted: true, content: null, coverImage: null, chapters: null, updatedAt: now })
		.where(and(eq(syncBooks.userId, userId), eq(syncBooks.bookId, bookId)))
		.returning({ bookId: syncBooks.bookId });
	if (updated.length === 0) return false;
	await tx
		.update(syncHighlights)
		.set({ deleted: true, updatedAt: now })
		.where(
			and(
				eq(syncHighlights.userId, userId),
				eq(syncHighlights.bookId, bookId),
				eq(syncHighlights.deleted, false),
			),
		);
	return true;
}

export type TakedownRow = {
	userId: string;
	bookId: string;
	originUserId?: string | null;
	originBookId?: string | null;
};

/**
 * Removes books because of a notice and records each removal, so the sync push
 * can refuse to bring the book back even after its tombstone has been cleaned
 * up. Books that no longer exist still get a record: the owner's offline
 * device may hold a copy.
 */
export async function takeDownBooks(
	tx: Tx,
	rows: TakedownRow[],
	noticeId: string | null,
	scope: TakedownScope,
	now = new Date(),
): Promise<void> {
	for (const row of rows) {
		await tombstoneBook(tx, row.userId, row.bookId, now);
		await tx
			.insert(socialTakedown)
			.values({
				scope,
				userId: row.userId,
				bookId: row.bookId,
				originUserId: row.originUserId ?? null,
				originBookId: row.originBookId ?? null,
				noticeId,
				createdAt: now,
			})
			.onConflictDoNothing();
	}
}

/** The book ids among `bookIds` that were taken down for `userId` and must not be stored again. */
export async function takenDownBookIds(
	exec: DbExecutor,
	userId: string,
	bookIds: readonly string[],
): Promise<Set<string>> {
	if (bookIds.length === 0) return new Set();
	const rows = await exec
		.select({ bookId: socialTakedown.bookId })
		.from(socialTakedown)
		.where(and(eq(socialTakedown.userId, userId), inArray(socialTakedown.bookId, [...bookIds])));
	return new Set(rows.map((r) => r.bookId));
}

/** True when an origin-scope removal covers this source book, so no copy of it may be shared again. */
export async function isOriginTakenDown(
	originUserId: string,
	originBookId: string,
	exec: DbExecutor = db,
): Promise<boolean> {
	const rows = await exec
		.select({ id: socialTakedown.id })
		.from(socialTakedown)
		.where(
			and(
				eq(socialTakedown.scope, "origin"),
				eq(socialTakedown.originUserId, originUserId),
				eq(socialTakedown.originBookId, originBookId),
			),
		)
		.limit(1);
	return rows.length > 0;
}
