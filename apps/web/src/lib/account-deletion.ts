import { eq } from "drizzle-orm";
import { db, type Tx } from "~/db";
import { user as authUser } from "~/db/auth-schema";
import {
	socialNotice,
	socialRestriction,
	syncBooks,
	syncGlossaryEntries,
	syncHighlights,
	syncReadingSessions,
	syncSeries,
	syncSettings,
} from "~/db/schema";
import { endBuddyReadsOf } from "./social/buddy-reads";
import { releaseHandlesForDeletedUser } from "./social/handle";

// The sync tables key on a plain userId with no FK to the user table, so they
// are not cascade-deleted and must be purged explicitly. Deletes run
// sequentially because a transaction uses one connection, where concurrent
// queries rely on pg behaviour deprecated for removal in pg@9.

/** "Clear cloud data": the user keeps the account, its social profile and series. */
export async function purgeCloudData(tx: Tx, userId: string): Promise<void> {
	await tx.delete(syncBooks).where(eq(syncBooks.userId, userId));
	// Without books the user no longer counts in any buddy read; a read nobody
	// else is left in goes now rather than lingering until someone opens it.
	await endBuddyReadsOf(tx, userId);
	await tx.delete(syncHighlights).where(eq(syncHighlights.userId, userId));
	await tx.delete(syncGlossaryEntries).where(eq(syncGlossaryEntries.userId, userId));
	await tx.delete(syncSettings).where(eq(syncSettings.userId, userId));
}

// Must run while the user row still exists: the handle release matches on
// user_id, which the FK nulls once the row is gone. Social tables cascade.
export async function purgeUserSyncData(tx: Tx, userId: string): Promise<void> {
	await releaseHandlesForDeletedUser(tx, userId);
	await purgeCloudData(tx, userId);
	await tx.delete(syncSeries).where(eq(syncSeries.userId, userId));
	await tx.delete(syncReadingSessions).where(eq(syncReadingSessions.userId, userId));
	// Notices and takedown records stay for their retention period; only the
	// notifier's identity goes. Restrictions end with the account.
	await tx
		.update(socialNotice)
		.set({ notifierUserId: null, notifierName: null, notifierEmail: null })
		.where(eq(socialNotice.notifierUserId, userId));
	await tx.delete(socialRestriction).where(eq(socialRestriction.userId, userId));
}

// The only way an account is deleted: the purge and the user row go in one
// transaction, and the user delete cascades to the session and account tables.
// No password is required, so OAuth-only users (Google, Discord) can delete
// their account too.
export async function deleteUserAccount(userId: string): Promise<void> {
	await db.transaction(async (tx) => {
		await purgeUserSyncData(tx, userId);
		await tx.delete(authUser).where(eq(authUser.id, userId));
	});
}
