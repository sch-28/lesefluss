import { eq } from "drizzle-orm";
import { db } from "~/db";
import { user as authUser } from "~/db/auth-schema";
import {
	syncBooks,
	syncGlossaryEntries,
	syncHighlights,
	syncReadingSessions,
	syncSeries,
	syncSettings,
} from "~/db/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// The sync tables key on a plain userId with no FK to the user table, so they
// are not cascade-deleted and must be purged explicitly. Deletes run
// sequentially because a transaction uses one connection, where concurrent
// queries rely on pg behaviour deprecated for removal in pg@9.
export async function purgeUserSyncData(tx: Tx, userId: string): Promise<void> {
	await tx.delete(syncBooks).where(eq(syncBooks.userId, userId));
	await tx.delete(syncHighlights).where(eq(syncHighlights.userId, userId));
	await tx.delete(syncGlossaryEntries).where(eq(syncGlossaryEntries.userId, userId));
	await tx.delete(syncSettings).where(eq(syncSettings.userId, userId));
	await tx.delete(syncSeries).where(eq(syncSeries.userId, userId));
	await tx.delete(syncReadingSessions).where(eq(syncReadingSessions.userId, userId));
}

// Deletes the sync tables then the user row; the user delete cascades to the
// session and account tables. No password is required, which is what lets
// OAuth-only users (Google, Discord) delete their account where better-auth's
// /delete-user cannot, since it requires a credential account they never have.
export async function deleteUserAccount(userId: string): Promise<void> {
	await db.transaction(async (tx) => {
		await purgeUserSyncData(tx, userId);
		await tx.delete(authUser).where(eq(authUser.id, userId));
	});
}
