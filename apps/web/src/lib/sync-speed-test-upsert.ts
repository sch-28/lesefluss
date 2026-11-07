import type { SyncSpeedTest } from "@lesefluss/core";
import { sql } from "drizzle-orm";
import type { DbExecutor } from "~/db";
import { type NewSyncSpeedTest, syncSpeedTests } from "~/db/schema";

// 8 bound columns per row stays far under Postgres' 65535 parameters.
const CHUNK_SIZE = 1000;

/**
 * Last-write-wins upsert of pushed speed tests. A tombstone is final, so a
 * device that missed "Delete reading stats" cannot push a wiped test back, and
 * a test is never tombstoned for being absent from a push.
 */
export async function upsertSyncSpeedTests(
	exec: DbExecutor,
	userId: string,
	tests: SyncSpeedTest[],
): Promise<void> {
	const byId = new Map<string, SyncSpeedTest>();
	for (const test of tests) {
		const seen = byId.get(test.testId);
		if (!seen || test.deleted || (!seen.deleted && test.updatedAt > seen.updatedAt)) {
			byId.set(test.testId, test);
		}
	}
	const rows = [...byId.values()].map((test) => speedTestInsertValues(userId, test));
	for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
		await exec
			.insert(syncSpeedTests)
			.values(rows.slice(i, i + CHUNK_SIZE))
			.onConflictDoUpdate({
				target: [syncSpeedTests.userId, syncSpeedTests.testId],
				set: {
					readingWpm: sql`excluded.reading_wpm`,
					rsvpWpm: sql`excluded.rsvp_wpm`,
					passageId: sql`excluded.passage_id`,
					deleted: sql`excluded.deleted`,
					createdAt: sql`excluded.created_at`,
					updatedAt: sql`GREATEST(excluded.updated_at, sync_speed_tests.updated_at)`,
				},
				setWhere: sql`sync_speed_tests.deleted = false AND (excluded.deleted OR excluded.updated_at > sync_speed_tests.updated_at)`,
			});
	}
}

function speedTestInsertValues(userId: string, test: SyncSpeedTest): NewSyncSpeedTest {
	return {
		userId,
		testId: test.testId,
		readingWpm: test.readingWpm,
		rsvpWpm: test.rsvpWpm,
		passageId: test.passageId,
		deleted: test.deleted,
		createdAt: new Date(test.createdAt),
		updatedAt: new Date(test.updatedAt),
	};
}
