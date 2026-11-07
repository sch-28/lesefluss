// @vitest-environment node
//
// Speed test upsert merge rules against a real Postgres database. Skipped when
// DATABASE_URL is unset so it never breaks `pnpm test`.
import { randomUUID } from "node:crypto";
import type { SyncSpeedTest } from "@lesefluss/core";
import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, test } from "vitest";
import { db } from "~/db";
import { syncSpeedTests } from "~/db/schema";
import { upsertSyncSpeedTests } from "./sync-speed-test-upsert";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("sync_speed_tests upsert (integration)", () => {
	const userId = `test-speed-test-upsert-${randomUUID()}`;

	afterAll(async () => {
		await db.delete(syncSpeedTests).where(eq(syncSpeedTests.userId, userId));
	});

	function makeTest(overrides: Partial<SyncSpeedTest> = {}): SyncSpeedTest {
		return {
			testId: "t1",
			readingWpm: 260,
			rsvpWpm: 390,
			passageId: "canal-1",
			deleted: false,
			createdAt: 1_000_000,
			updatedAt: 1_000_000,
			...overrides,
		};
	}

	async function read(testId: string) {
		const [row] = await db
			.select()
			.from(syncSpeedTests)
			.where(and(eq(syncSpeedTests.userId, userId), eq(syncSpeedTests.testId, testId)));
		return row;
	}

	test("a newer push wins and an older one is ignored", async () => {
		await upsertSyncSpeedTests(db, userId, [makeTest()]);
		await upsertSyncSpeedTests(db, userId, [makeTest({ readingWpm: 300, updatedAt: 2_000_000 })]);
		await upsertSyncSpeedTests(db, userId, [makeTest({ readingWpm: 111, updatedAt: 1_500_000 })]);
		expect(await read("t1")).toMatchObject({ readingWpm: 300, rsvpWpm: 390, deleted: false });
	});

	test("a tombstone is final, even against a newer live push", async () => {
		await upsertSyncSpeedTests(db, userId, [makeTest({ testId: "t2" })]);
		await upsertSyncSpeedTests(db, userId, [makeTest({ testId: "t2", deleted: true })]);
		await upsertSyncSpeedTests(db, userId, [
			makeTest({ testId: "t2", readingWpm: 500, updatedAt: 9_000_000 }),
		]);
		expect(await read("t2")).toMatchObject({ deleted: true, readingWpm: 260 });
	});

	test("a tombstone in the same push beats the live copy", async () => {
		await upsertSyncSpeedTests(db, userId, [
			makeTest({ testId: "t3", updatedAt: 5_000_000 }),
			makeTest({ testId: "t3", deleted: true }),
		]);
		expect((await read("t3"))?.deleted).toBe(true);
	});
});
