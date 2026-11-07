import { and, eq, sql } from "drizzle-orm";
import { db } from "~/db";
import { syncReadingGoals, syncReadingSessions, syncSpeedTests } from "~/db/schema";

/**
 * Tombstones sessions in one statement, so a batch lands whole or not at all.
 * The delete can reach the server before the push that would create a row, so a
 * missing row gets a placeholder tombstone: without one, that push would store
 * the session live and it would come back everywhere. The placeholder's columns
 * are never read, since every reader skips tombstones.
 */
export async function tombstoneSessions(userId: string, sessionIds: string[]): Promise<void> {
	const ids = [...new Set(sessionIds)];
	if (ids.length === 0) return;
	const now = new Date();
	await db
		.insert(syncReadingSessions)
		.values(
			ids.map((sessionId) => ({
				userId,
				sessionId,
				bookId: "",
				mode: "scroll" as const,
				startedAt: now,
				endedAt: now,
				durationMs: 0,
				wordsRead: 0,
				startWord: 0,
				endWord: 0,
				deleted: true,
				updatedAt: now,
			})),
		)
		.onConflictDoUpdate({
			target: [syncReadingSessions.userId, syncReadingSessions.sessionId],
			set: { deleted: true, updatedAt: now },
			setWhere: sql`sync_reading_sessions.deleted = false`,
		});
}

export function tombstoneSession(userId: string, sessionId: string): Promise<void> {
	return tombstoneSessions(userId, [sessionId]);
}

/**
 * "Delete reading stats": sessions, reading goals and speed tests.
 * Buddies see a standing worked out from a goal, so one must not outlive it here.
 * Both are tombstoned rather than deleted so other devices drop their copies.
 */
export async function wipeReadingStats(userId: string): Promise<void> {
	await db.transaction(async (tx) => {
		await tx
			.update(syncReadingSessions)
			.set({ deleted: true, updatedAt: new Date() })
			.where(and(eq(syncReadingSessions.userId, userId), eq(syncReadingSessions.deleted, false)));
		await tx
			.update(syncReadingGoals)
			.set({ deleted: true, updatedAt: new Date() })
			.where(and(eq(syncReadingGoals.userId, userId), eq(syncReadingGoals.deleted, false)));
		await tx
			.update(syncSpeedTests)
			.set({ deleted: true, updatedAt: new Date() })
			.where(and(eq(syncSpeedTests.userId, userId), eq(syncSpeedTests.deleted, false)));
	});
}
