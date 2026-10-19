import { eq } from "drizzle-orm";
import { db } from "~/db";
import { syncReadingGoals, syncReadingSessions } from "~/db/schema";

/**
 * "Delete reading stats": sessions, and the goals that ride the same opt-out.
 * Buddies see a standing worked out from a goal, so one must not outlive it here.
 */
export async function wipeReadingStats(userId: string): Promise<void> {
	await db.transaction(async (tx) => {
		await tx.delete(syncReadingSessions).where(eq(syncReadingSessions.userId, userId));
		await tx.delete(syncReadingGoals).where(eq(syncReadingGoals.userId, userId));
	});
}

/**
 * A device stopped syncing stats, so it no longer pushes goals; a copy left
 * here would keep showing buddies a standing that no longer exists.
 */
export async function wipeReadingGoals(userId: string): Promise<void> {
	await db.delete(syncReadingGoals).where(eq(syncReadingGoals.userId, userId));
}
