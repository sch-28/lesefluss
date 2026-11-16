import { SPEED_TEST_WPM_MAX } from "@lesefluss/core";
import { between, desc, inArray, sql } from "drizzle-orm";
import { randomSessionId } from "../../../utils/random-id";
import { PLAUSIBLE_WPM } from "../../stats/speed-test";
import { serverNow } from "../../sync/server-clock";
import { db } from "../index";
import { type SpeedTestRow, speedTests } from "../schema";

// 6 bound columns per row stays well under SQLite's 999 parameters.
const CHUNK_SIZE = 100;

export type SpeedTestInput = {
	readingWpm: number;
	rsvpWpm: number | null;
	passageId: string;
};

/** "Keep result" can keep an implausible reading; past the sync bound the row would never push. */
function storableWpm(wpm: number): number {
	return Math.min(SPEED_TEST_WPM_MAX, Math.max(1, Math.round(wpm)));
}

export async function addSpeedTest(
	input: SpeedTestInput,
	now = serverNow(),
): Promise<SpeedTestRow> {
	const row: SpeedTestRow = {
		id: randomSessionId(),
		readingWpm: storableWpm(input.readingWpm),
		rsvpWpm: input.rsvpWpm == null ? null : storableWpm(input.rsvpWpm),
		passageId: input.passageId,
		createdAt: now,
		updatedAt: now,
	};
	await db.insert(speedTests).values(row);
	return row;
}

/** Newest first. */
export async function getSpeedTests(): Promise<SpeedTestRow[]> {
	return db.select().from(speedTests).orderBy(desc(speedTests.createdAt), desc(speedTests.id));
}

/** A kept implausible test stays on the trend but never seeds the speed model. */
export async function getLatestPlausibleSpeedTest(): Promise<SpeedTestRow | null> {
	const [row] = await db
		.select()
		.from(speedTests)
		.where(between(speedTests.readingWpm, PLAUSIBLE_WPM.min, PLAUSIBLE_WPM.max))
		.orderBy(desc(speedTests.createdAt), desc(speedTests.id))
		.limit(1);
	return row ?? null;
}

/** Last-write-wins on `updatedAt`. */
export async function upsertSpeedTests(rows: SpeedTestRow[]): Promise<void> {
	for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
		await db
			.insert(speedTests)
			.values(rows.slice(i, i + CHUNK_SIZE))
			.onConflictDoUpdate({
				target: speedTests.id,
				set: {
					readingWpm: sql`excluded.reading_wpm`,
					rsvpWpm: sql`excluded.rsvp_wpm`,
					passageId: sql`excluded.passage_id`,
					createdAt: sql`excluded.created_at`,
					updatedAt: sql`excluded.updated_at`,
				},
				where: sql`${speedTests.updatedAt} < excluded.updated_at`,
			});
	}
}

export async function hardDeleteSpeedTests(ids: string[]): Promise<void> {
	for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
		await db.delete(speedTests).where(inArray(speedTests.id, ids.slice(i, i + CHUNK_SIZE)));
	}
}

export async function deleteAllSpeedTests(): Promise<void> {
	await db.delete(speedTests);
}
