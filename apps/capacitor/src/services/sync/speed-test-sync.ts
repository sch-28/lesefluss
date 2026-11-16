import { SPEED_TESTS_PUSH_MAX, type SyncSpeedTest, SyncSpeedTestSchema } from "@lesefluss/core";
import type { SpeedTestRow } from "../db/schema";

export function speedTestToSync(row: SpeedTestRow): SyncSpeedTest {
	return {
		testId: row.id,
		readingWpm: row.readingWpm,
		rsvpWpm: row.rsvpWpm,
		passageId: row.passageId,
		deleted: false,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

/** A server tombstone removes the local row whatever its stamp; live rows go newest-wins. */
export function buildSpeedTestMerge(
	local: SpeedTestRow[],
	server: unknown[],
): { upserts: SpeedTestRow[]; deletes: string[]; rejected: number } {
	const localById = new Map(local.map((row) => [row.id, row]));
	const upserts: SpeedTestRow[] = [];
	const deletes: string[] = [];
	let rejected = 0;
	for (const raw of server) {
		const parsed = SyncSpeedTestSchema.safeParse(raw);
		if (!parsed.success) {
			rejected++;
			continue;
		}
		const test = parsed.data;
		const mine = localById.get(test.testId);
		if (test.deleted) {
			if (mine) deletes.push(test.testId);
			continue;
		}
		if (mine && test.updatedAt <= mine.updatedAt) continue;
		upserts.push({
			id: test.testId,
			readingWpm: test.readingWpm,
			rsvpWpm: test.rsvpWpm,
			passageId: test.passageId,
			createdAt: test.createdAt,
			updatedAt: test.updatedAt,
		});
	}
	return { upserts, deletes, rejected };
}

/** Invalid rows stay local: one would 400 the whole push. */
export function pushableSpeedTests(local: SpeedTestRow[]) {
	const rows = local.map(speedTestToSync);
	const valid = rows.filter((row) => SyncSpeedTestSchema.safeParse(row).success);
	const speedTests =
		valid.length > SPEED_TESTS_PUSH_MAX
			? [...valid].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, SPEED_TESTS_PUSH_MAX)
			: valid;
	return { speedTests, rejected: rows.length - valid.length };
}
