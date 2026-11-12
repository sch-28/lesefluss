import { and, eq, sql } from "drizzle-orm";
import { db } from "~/db";
import { syncReadingGoals, syncReadingSessions, syncSpeedTests } from "~/db/schema";

const CLEARED_AT = new Date(0);

/**
 * What a session tombstone holds besides its id: nothing of the reading. Every
 * reader skips tombstones and a pull hands out only their ids, so the columns
 * only have to satisfy the table.
 */
const CLEARED_SESSION = {
	bookId: "",
	mode: "scroll" as const,
	startedAt: CLEARED_AT,
	endedAt: CLEARED_AT,
	durationMs: 0,
	wordsRead: 0,
	startWord: 0,
	endWord: 0,
	furthestWord: null,
	wpmAvg: null,
	fontSize: null,
	segmentWpm: null,
};

/**
 * Speed-test tombstones are pulled whole, and the pull schema needs a positive
 * wpm and a passage id, or other devices reject the tombstone and keep their copy.
 */
const CLEARED_SPEED_TEST = {
	readingWpm: 1,
	rsvpWpm: null,
	passageId: "wiped",
	createdAt: CLEARED_AT,
};

/**
 * Tombstones sessions in one statement, so a batch lands whole or not at all,
 * and clears them as the stats wipe does. The delete can reach the server before
 * the push that would create a row, so a missing row gets a tombstone too:
 * without one, that push would store the session live and it would come back
 * everywhere. A row tombstoned earlier keeps its time, so pulls do not list it again.
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
				...CLEARED_SESSION,
				deleted: true,
				updatedAt: now,
			})),
		)
		.onConflictDoUpdate({
			target: [syncReadingSessions.userId, syncReadingSessions.sessionId],
			set: {
				...CLEARED_SESSION,
				deleted: true,
				updatedAt: sql`CASE WHEN sync_reading_sessions.deleted THEN sync_reading_sessions.updated_at ELSE excluded.updated_at END`,
			},
		});
}

export function tombstoneSession(userId: string, sessionId: string): Promise<void> {
	return tombstoneSessions(userId, [sessionId]);
}

/**
 * "Delete reading stats": sessions, reading goals and speed tests.
 * Buddies see a standing worked out from a goal, so one must not outlive it here.
 * Rows are tombstoned rather than deleted so other devices drop their copies.
 * Session and speed-test tombstones, earlier ones included, keep nothing of the reading.
 */
export async function wipeReadingStats(userId: string): Promise<void> {
	const now = new Date();
	await db.transaction(async (tx) => {
		await tx
			.update(syncReadingSessions)
			.set({ deleted: true, updatedAt: now })
			.where(and(eq(syncReadingSessions.userId, userId), eq(syncReadingSessions.deleted, false)));
		await tx
			.update(syncReadingSessions)
			.set(CLEARED_SESSION)
			.where(and(eq(syncReadingSessions.userId, userId), eq(syncReadingSessions.deleted, true)));
		await tx
			.update(syncReadingGoals)
			.set({ deleted: true, updatedAt: now })
			.where(and(eq(syncReadingGoals.userId, userId), eq(syncReadingGoals.deleted, false)));
		await tx
			.update(syncSpeedTests)
			.set({ deleted: true, updatedAt: now })
			.where(and(eq(syncSpeedTests.userId, userId), eq(syncSpeedTests.deleted, false)));
		await tx
			.update(syncSpeedTests)
			.set(CLEARED_SPEED_TEST)
			.where(and(eq(syncSpeedTests.userId, userId), eq(syncSpeedTests.deleted, true)));
	});
}
