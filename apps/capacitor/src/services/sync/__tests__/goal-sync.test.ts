import { SyncPayloadSchema, wordPos } from "@lesefluss/core";
import { describe, expect, it } from "vitest";
import type { ReadingGoal } from "../../db/schema";
import { buildGoalMerge, goalToSync, pushableGoals } from "../index";

function goal(overrides: Partial<ReadingGoal> = {}): ReadingGoal {
	return {
		id: "g1",
		bookId: "deadbeef",
		mode: "deadline",
		status: "active",
		startedAt: 1_000,
		startWord: wordPos(0),
		planStartDate: "2026-03-01",
		planStartWord: wordPos(0),
		targetDate: "2026-03-10",
		dailyPercent: 10,
		carriedDaysMet: 0,
		completedAt: null,
		reminderTime: null,
		deleted: false,
		createdAt: 1_000,
		updatedAt: 1_000,
		...overrides,
	};
}

const BOOKS = new Set(["deadbeef"]);

describe("goal sync round trip", () => {
	it("survives push validation and comes back unchanged", () => {
		const local = goal({
			dailyPercent: 0.55,
			carriedDaysMet: 3,
			completedAt: 5_000,
			status: "completed",
		});
		const payload = SyncPayloadSchema.parse({
			books: [],
			settings: null,
			highlights: [],
			readingGoals: [goalToSync(local)],
		});
		const merge = buildGoalMerge([], payload.readingGoals ?? [], BOOKS);
		expect(merge.upserts).toEqual([local]);
	});

	it("carries the reminder time, and rejects one missing or not a time of day", () => {
		const local = goal({ reminderTime: "07:30" });
		expect(buildGoalMerge([], [goalToSync(local)], BOOKS).upserts).toEqual([local]);
		const bad = { ...goalToSync(local), reminderTime: "25:00" };
		expect(buildGoalMerge([], [bad], BOOKS)).toMatchObject({ upserts: [], rejected: 1 });
		const legacy: Record<string, unknown> = { ...goalToSync(local) };
		delete legacy.reminderTime;
		expect(buildGoalMerge([], [legacy], BOOKS)).toMatchObject({ upserts: [], rejected: 1 });
	});

	it("leaves goals out of a payload from a client that pre-dates them", () => {
		const payload = SyncPayloadSchema.parse({ books: [], settings: null, highlights: [] });
		expect(payload.readingGoals).toBeUndefined();
	});
});

describe("buildGoalMerge", () => {
	it("takes a newer server row and ignores an older or equal one", () => {
		const local = goal({ updatedAt: 2_000 });
		const newer = goalToSync(goal({ targetDate: "2026-04-01", updatedAt: 3_000 }));
		const older = goalToSync(goal({ targetDate: "2026-02-01", updatedAt: 1_500 }));
		expect(buildGoalMerge([local], [newer], BOOKS).upserts[0]?.targetDate).toBe("2026-04-01");
		expect(buildGoalMerge([local], [older], BOOKS).upserts).toEqual([]);
		expect(buildGoalMerge([local], [goalToSync(local)], BOOKS).upserts).toEqual([]);
	});

	it("deletes locally on a server tombstone at least as new", () => {
		const local = goal({ updatedAt: 2_000 });
		const tombstone = goalToSync(goal({ deleted: true, updatedAt: 2_000 }));
		expect(buildGoalMerge([local], [tombstone], BOOKS).deletes).toEqual(["g1"]);
	});

	it("keeps a local edit made after the delete elsewhere", () => {
		const local = goal({ updatedAt: 3_000 });
		const tombstone = goalToSync(goal({ deleted: true, updatedAt: 2_000 }));
		expect(buildGoalMerge([local], [tombstone], BOOKS)).toMatchObject({ upserts: [], deletes: [] });
	});

	it("clears a local tombstone once the server holds the delete", () => {
		const local = goal({ deleted: true, updatedAt: 2_000 });
		const tombstone = goalToSync(goal({ deleted: true, updatedAt: 2_000 }));
		expect(buildGoalMerge([local], [tombstone], BOOKS).deletes).toEqual(["g1"]);
	});

	it("never inserts a tombstone it does not hold", () => {
		const tombstone = goalToSync(goal({ deleted: true }));
		expect(buildGoalMerge([], [tombstone], BOOKS)).toMatchObject({ upserts: [], deletes: [] });
	});

	it("skips goals for books this device does not hold", () => {
		const other = goalToSync(goal({ bookId: "cafebabe" }));
		expect(buildGoalMerge([], [other], BOOKS).upserts).toEqual([]);
	});

	it("counts malformed rows instead of failing the pull", () => {
		const bad = { ...goalToSync(goal()), mode: "sprint" };
		expect(buildGoalMerge([], [bad], BOOKS)).toMatchObject({ upserts: [], rejected: 1 });
	});
});

describe("pushableGoals", () => {
	it("sends goals of pushed books, tombstones included, and drops malformed rows", () => {
		const rows = [
			goal({ id: "a" }),
			goal({ id: "b", deleted: true }),
			goal({ id: "c", bookId: "cafebabe" }),
			goal({ id: "d", targetDate: "soon" }),
		];
		const { pushable, rejected } = pushableGoals(rows, BOOKS);
		expect(pushable.map((g) => g.goalId)).toEqual(["a", "b"]);
		expect(rejected).toBe(1);
	});
});
