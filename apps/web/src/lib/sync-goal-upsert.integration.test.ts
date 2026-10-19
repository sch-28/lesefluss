// @vitest-environment node
//
// Goal upsert merge rules against a real Postgres database. Skipped when
// DATABASE_URL is unset so it never breaks `pnpm test`.
import { randomUUID } from "node:crypto";
import type { SyncReadingGoal } from "@lesefluss/core";
import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, test } from "vitest";
import { db } from "~/db";
import { syncReadingGoals } from "~/db/schema";
import { upsertSyncGoals } from "./sync-goal-upsert";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("sync_reading_goals upsert (integration)", () => {
	const userId = `test-goal-upsert-${randomUUID()}`;

	afterAll(async () => {
		await db.delete(syncReadingGoals).where(eq(syncReadingGoals.userId, userId));
	});

	function makeGoal(overrides: Partial<SyncReadingGoal> = {}): SyncReadingGoal {
		return {
			goalId: "g1",
			bookId: "deadbeef",
			mode: "deadline",
			status: "active",
			startedAt: 1_000_000,
			startWord: 0,
			planStartDate: "2026-03-01",
			planStartWord: 0,
			targetDate: "2026-03-10",
			dailyPercent: 0.55,
			carriedDaysMet: 0,
			completedAt: null,
			reminderTime: null,
			deleted: false,
			createdAt: 1_000_000,
			updatedAt: 1_000_000,
			...overrides,
		};
	}

	async function read(goalId: string) {
		const [row] = await db
			.select()
			.from(syncReadingGoals)
			.where(and(eq(syncReadingGoals.userId, userId), eq(syncReadingGoals.goalId, goalId)));
		return row;
	}

	test("stores a goal with its percent intact", async () => {
		await upsertSyncGoals(db, userId, [makeGoal()]);
		expect(await read("g1")).toMatchObject({ dailyPercent: 0.55, targetDate: "2026-03-10" });
	});

	test("a newer write wins and an older one is ignored", async () => {
		await upsertSyncGoals(db, userId, [
			makeGoal({ targetDate: "2026-04-01", updatedAt: 2_000_000 }),
		]);
		await upsertSyncGoals(db, userId, [
			makeGoal({ targetDate: "2026-02-01", updatedAt: 1_500_000 }),
		]);
		expect((await read("g1"))?.targetDate).toBe("2026-04-01");
	});

	test("a newer delete wins and an older edit cannot resurrect it", async () => {
		await upsertSyncGoals(db, userId, [makeGoal({ deleted: true, updatedAt: 3_000_000 })]);
		await upsertSyncGoals(db, userId, [
			makeGoal({ targetDate: "2026-05-01", updatedAt: 2_500_000 }),
		]);
		expect(await read("g1")).toMatchObject({ deleted: true, targetDate: "2026-03-10" });
	});

	test("stores and clears the reminder time with the goal", async () => {
		await upsertSyncGoals(db, userId, [makeGoal({ goalId: "g5", reminderTime: "07:30" })]);
		expect((await read("g5"))?.reminderTime).toBe("07:30");
		await upsertSyncGoals(db, userId, [
			makeGoal({ goalId: "g5", reminderTime: null, updatedAt: 2_000_000 }),
		]);
		expect((await read("g5"))?.reminderTime).toBeNull();
	});

	test("a goal missing from a push is left alone", async () => {
		await upsertSyncGoals(db, userId, [makeGoal({ goalId: "g2" })]);
		await upsertSyncGoals(db, userId, [makeGoal({ goalId: "g3" })]);
		expect((await read("g2"))?.deleted).toBe(false);
	});
});
