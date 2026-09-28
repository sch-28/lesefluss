import { and, eq, or, sql } from "drizzle-orm";
import type { Tx } from "~/db";
import { socialShare, syncBooks } from "~/db/schema";
import type { BookOrigin } from "~/lib/origin";
import { createNotification } from "~/lib/social/inbox";
import { revokeShares } from "~/lib/social/shares";
import { pairIn } from "~/lib/sql-helpers";
import { type TakedownRow, type TakedownScope, takeDownBooks } from "./takedown";

export const SHARE_REMOVED_TEXT =
	"A book that was shared with you was removed following a notice. It is deleted from your library on the next sync.";

/**
 * Takes down a reported book. `copy` removes the reported row; `origin` also
 * removes every other copy of the same origin except the origin row itself,
 * found through the origin columns so it works after the sender's account is
 * gone. Pending shares of the removed content are withdrawn and every other
 * owner of a removed copy gets a neutral inbox item; the reported row's owner
 * gets the statement of reasons instead.
 */
export async function takeDownReportedBook(
	tx: Tx,
	ref: { userId: string; bookId: string },
	scope: TakedownScope,
	noticeId: string,
	now: Date,
	/** The origin as the notice recorded it, for when the reported row is gone with the sender's account. */
	recordedOrigin: BookOrigin | null = null,
): Promise<{ removed: TakedownRow[] }> {
	const [reported] = await tx
		.select({ originUserId: syncBooks.originUserId, originBookId: syncBooks.originBookId })
		.from(syncBooks)
		.where(and(eq(syncBooks.userId, ref.userId), eq(syncBooks.bookId, ref.bookId)));
	// Without either, the reported row is taken to be its own origin: that still
	// reaches every copy made from it.
	const origin: BookOrigin = reported ??
		recordedOrigin ?? { originUserId: ref.userId, originBookId: ref.bookId };
	const rows: TakedownRow[] = [{ ...ref, ...origin }];

	if (scope === "origin") {
		const copies = await tx
			.select({ userId: syncBooks.userId, bookId: syncBooks.bookId })
			.from(syncBooks)
			.where(
				and(
					eq(syncBooks.originUserId, origin.originUserId),
					eq(syncBooks.originBookId, origin.originBookId),
					eq(syncBooks.deleted, false),
					sql`NOT (${syncBooks.userId} = ${origin.originUserId} AND ${syncBooks.bookId} = ${origin.originBookId})`,
				),
			);
		for (const copy of copies) {
			if (copy.userId === ref.userId && copy.bookId === ref.bookId) continue;
			rows.push({ ...copy, ...origin });
		}
	}
	await takeDownBooks(tx, rows, noticeId, scope, now);

	await revokeShares(
		tx,
		or(
			pairIn(
				[socialShare.senderId, socialShare.bookId],
				rows.map((r) => [r.userId, r.bookId]),
			),
			scope === "origin"
				? and(
						eq(socialShare.originUserId, origin.originUserId),
						eq(socialShare.originBookId, origin.originBookId),
					)
				: undefined,
		),
		now,
	);

	for (const row of rows) {
		if (row.userId === ref.userId) continue;
		await createNotification(
			tx,
			{
				recipientId: row.userId,
				actorId: null,
				type: "share_removed",
				subjectId: `${noticeId}:${row.bookId}`,
				payload: { text: SHARE_REMOVED_TEXT },
			},
			now,
		);
	}
	return { removed: rows };
}
