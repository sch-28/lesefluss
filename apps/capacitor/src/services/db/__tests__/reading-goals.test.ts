// @vitest-environment node
import type { SQLInputValue } from "node:sqlite";
import { wordPos } from "@lesefluss/core";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Book, ReadingGoal } from "../schema";
import { createTestDb } from "./test-db";

const { db, raw, close } = createTestDb();
vi.mock("../index", () => ({
	get db() {
		return db;
	},
}));
afterAll(close);

const goals = await import("../queries/reading-goals");
const { deleteBook, hardDeleteBook, updateBook } = await import("../queries/books");

const NOW = new Date(2026, 2, 1, 12).getTime();

function insertBook(id: string, overrides: Record<string, SQLInputValue> = {}) {
	const row: Record<string, SQLInputValue> = {
		id,
		title: id,
		file_format: "epub",
		size: 1,
		word_position: 0,
		word_count: 1000,
		is_active: 0,
		added_at: 0,
		deleted: 0,
		...overrides,
	};
	const keys = Object.keys(row);
	raw
		.prepare(`INSERT INTO books (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`)
		.run(...Object.values(row));
}

function book(id: string, overrides: Partial<Book> = {}) {
	return {
		id,
		seriesId: null,
		deleted: false,
		wordPosition: wordPos(0),
		wordCount: 1000,
		...overrides,
	};
}

function rows(): ReadingGoal[] {
	return raw
		.prepare(
			"SELECT id, book_id AS bookId, status, deleted, updated_at AS updatedAt FROM reading_goals ORDER BY created_at",
		)
		.all() as unknown as ReadingGoal[];
}

beforeEach(() => {
	raw.exec("DELETE FROM reading_goals; DELETE FROM books; DELETE FROM reading_sessions;");
	insertBook("aaaaaaaa");
});

describe("createGoal", () => {
	it("starts a goal at the book's position", async () => {
		const goal = await goals.createGoal(
			book("aaaaaaaa", { wordPosition: wordPos(200) }),
			{ mode: "deadline", targetDate: "2026-03-10" },
			NOW,
		);
		expect(goal).toMatchObject({
			status: "active",
			startWord: 200,
			planStartWord: 200,
			planStartDate: "2026-03-01",
		});
		expect(await goals.getActiveGoal("aaaaaaaa")).toEqual(goal);
	});

	it("keeps at most one active goal per book", async () => {
		const first = await goals.createGoal(book("aaaaaaaa"), { mode: "pace", dailyPercent: 1 }, NOW);
		const second = await goals.createGoal(
			book("aaaaaaaa"),
			{ mode: "pace", dailyPercent: 2 },
			NOW + 1,
		);
		expect((await goals.getActiveGoal("aaaaaaaa"))?.id).toBe(second.id);
		const old = (await goals.getGoalsForBook("aaaaaaaa")).find((g) => g.id === first.id);
		expect(old?.status).toBe("abandoned");
		expect(old?.updatedAt).toBe(NOW + 1);
	});

	it("refuses serial chapters", async () => {
		await expect(
			goals.createGoal(
				book("aaaaaaaa", { seriesId: "ssssssss" }),
				{ mode: "pace", dailyPercent: 1 },
				NOW,
			),
		).rejects.toThrow();
	});

	it("refuses a book that already counts as finished", async () => {
		await expect(
			goals.createGoal(
				book("aaaaaaaa", { wordPosition: wordPos(950) }),
				{ mode: "pace", dailyPercent: 1 },
				NOW,
			),
		).rejects.toThrow();
		expect(rows()).toEqual([]);
	});
});

describe("goal lifecycle", () => {
	it("updates, completes and removes a goal, stamping each change", async () => {
		const goal = await goals.createGoal(
			book("aaaaaaaa"),
			{ mode: "deadline", targetDate: "2026-03-10" },
			NOW,
		);
		await goals.updateGoal(goal.id, { targetDate: "2026-03-20" }, NOW + 1);
		expect((await goals.getActiveGoal("aaaaaaaa"))?.targetDate).toBe("2026-03-20");

		await updateBook("aaaaaaaa", { wordPosition: wordPos(960) });
		await goals.completeFinishedGoals(NOW + 2);
		expect(await goals.getActiveGoal("aaaaaaaa")).toBeNull();
		expect((await goals.getGoalsForBook("aaaaaaaa"))[0]).toMatchObject({
			status: "completed",
			completedAt: NOW + 2,
		});

		await goals.deleteGoal(goal.id, NOW + 3);
		expect(await goals.getGoalsForBook("aaaaaaaa")).toEqual([]);
		expect(rows()[0]).toMatchObject({ deleted: 1, updatedAt: NOW + 3 });
	});
});

describe("reminders", () => {
	it("start off, can be set and cleared, and only active goals with a time are listed", async () => {
		const goal = await goals.createGoal(book("aaaaaaaa"), { mode: "pace", dailyPercent: 1 }, NOW);
		expect(goal.reminderTime).toBeNull();
		expect(await goals.getGoalsWithReminders()).toEqual([]);

		await goals.setGoalReminder(goal.id, "07:30", NOW + 1);
		expect(await goals.getGoalsWithReminders()).toMatchObject([
			{ id: goal.id, reminderTime: "07:30", updatedAt: NOW + 1 },
		]);

		await goals.setGoalReminder(goal.id, null, NOW + 2);
		expect(await goals.getGoalsWithReminders()).toEqual([]);
	});

	it("are kept from creation and dropped from the list once the goal ends or is removed", async () => {
		const first = await goals.createGoal(
			book("aaaaaaaa"),
			{ mode: "pace", dailyPercent: 1 },
			NOW,
			"20:00",
		);
		expect((await goals.getGoalsWithReminders()).map((g) => g.id)).toEqual([first.id]);

		await updateBook("aaaaaaaa", { wordPosition: wordPos(960) });
		await goals.completeFinishedGoals(NOW + 1);
		expect(await goals.getGoalsWithReminders()).toEqual([]);

		insertBook("bbbbbbbb");
		const second = await goals.createGoal(
			book("bbbbbbbb"),
			{ mode: "pace", dailyPercent: 1 },
			NOW,
			"20:00",
		);
		await goals.deleteGoal(second.id, NOW + 1);
		expect(await goals.getGoalsWithReminders()).toEqual([]);
	});

	it("go with a deleted book", async () => {
		await goals.createGoal(book("aaaaaaaa"), { mode: "pace", dailyPercent: 1 }, NOW, "20:00");
		await deleteBook("aaaaaaaa");
		expect(await goals.getGoalsWithReminders()).toEqual([]);
	});
});

describe("completeFinishedGoals", () => {
	it("completes the active goal once the book crosses the finished threshold", async () => {
		const goal = await goals.createGoal(book("aaaaaaaa"), { mode: "pace", dailyPercent: 1 }, NOW);
		await updateBook("aaaaaaaa", { wordPosition: wordPos(949) });
		await goals.completeFinishedGoals(NOW + 1);
		expect((await goals.getActiveGoal("aaaaaaaa"))?.id).toBe(goal.id);

		await updateBook("aaaaaaaa", { wordPosition: wordPos(950) });
		await goals.completeFinishedGoals(NOW + 2);
		expect((await goals.getGoalsForBook("aaaaaaaa"))[0]).toMatchObject({
			status: "completed",
			completedAt: NOW + 2,
		});
	});

	it("agrees with the plan's finished rule at the threshold", async () => {
		const goal = await goals.createGoal(book("aaaaaaaa"), { mode: "pace", dailyPercent: 1 }, NOW);
		await updateBook("aaaaaaaa", { wordPosition: wordPos(945) });
		const result = await goals.getReadingGoalPlan("aaaaaaaa", NOW + 1);
		expect(result?.goal.id).toBe(goal.id);
		expect(result?.plan.isComplete).toBe(false);
	});

	it("leaves goals of unfinished books and books of unknown length alone", async () => {
		insertBook("bbbbbbbb", { word_count: 0, word_position: 50 });
		await goals.createGoal(book("aaaaaaaa"), { mode: "pace", dailyPercent: 1 }, NOW);
		await goals.createGoal(
			book("bbbbbbbb", { wordCount: 0 }),
			{ mode: "pace", dailyPercent: 1 },
			NOW,
		);
		await goals.completeFinishedGoals(NOW + 1);
		expect(rows().map((r) => r.status)).toEqual(["active", "active"]);
	});
});

describe("resolveActiveGoalConflicts", () => {
	it("keeps the newest created goal active when sync brings two", async () => {
		const base = await goals.createGoal(book("aaaaaaaa"), { mode: "pace", dailyPercent: 1 }, NOW);
		await goals.upsertGoals([{ ...base, id: "remote01", createdAt: NOW + 5, updatedAt: NOW + 5 }]);
		await goals.resolveActiveGoalConflicts(NOW + 10);
		const all = await goals.getGoalsForBook("aaaaaaaa");
		expect(all.map((g) => [g.id, g.status])).toEqual([
			["remote01", "active"],
			[base.id, "abandoned"],
		]);
		expect(all[1]?.updatedAt).toBe(NOW + 10);
	});
});

describe("upsertGoals", () => {
	it("is last-write-wins on updatedAt", async () => {
		const goal = await goals.createGoal(book("aaaaaaaa"), { mode: "pace", dailyPercent: 1 }, NOW);
		await goals.upsertGoals([{ ...goal, dailyPercent: 5, updatedAt: NOW - 1 }]);
		expect((await goals.getActiveGoal("aaaaaaaa"))?.dailyPercent).toBe(1);
		await goals.upsertGoals([{ ...goal, dailyPercent: 5, updatedAt: NOW + 1 }]);
		expect((await goals.getActiveGoal("aaaaaaaa"))?.dailyPercent).toBe(5);
	});
});

describe("book deletion", () => {
	it("tombstones the book's goals so the removal syncs", async () => {
		await goals.createGoal(book("aaaaaaaa"), { mode: "pace", dailyPercent: 1 }, NOW);
		await deleteBook("aaaaaaaa");
		expect(rows()[0]).toMatchObject({ deleted: 1 });
	});

	it("drops them with the book on a hard delete", async () => {
		await goals.createGoal(book("aaaaaaaa"), { mode: "pace", dailyPercent: 1 }, NOW);
		await hardDeleteBook("aaaaaaaa");
		expect(rows()).toEqual([]);
	});
});

describe("getReadingGoalPlan", () => {
	it("keeps showing a goal the book completed, but not one replaced or removed", async () => {
		const goal = await goals.createGoal(book("aaaaaaaa"), { mode: "pace", dailyPercent: 1 }, NOW);
		await updateBook("aaaaaaaa", { wordPosition: wordPos(960) });
		const done = await goals.getReadingGoalPlan("aaaaaaaa", NOW + 1);
		expect(done?.goal).toMatchObject({ id: goal.id, status: "completed" });
		expect(done?.plan.isComplete).toBe(true);

		await goals.deleteGoal(goal.id, NOW + 2);
		expect(await goals.getReadingGoalPlan("aaaaaaaa", NOW + 3)).toBeNull();
	});

	it("stops showing a completed goal once the book is no longer finished", async () => {
		await goals.createGoal(book("aaaaaaaa"), { mode: "pace", dailyPercent: 1 }, NOW);
		await updateBook("aaaaaaaa", { wordPosition: wordPos(960) });
		expect((await goals.getReadingGoalPlan("aaaaaaaa", NOW + 1))?.goal.status).toBe("completed");

		await updateBook("aaaaaaaa", { wordPosition: wordPos(400) });
		expect(await goals.getReadingGoalPlan("aaaaaaaa", NOW + 2)).toBeNull();
	});

	it("never brings back an older completed goal after a later one is removed", async () => {
		await goals.createGoal(book("aaaaaaaa"), { mode: "pace", dailyPercent: 1 }, NOW);
		await updateBook("aaaaaaaa", { wordPosition: wordPos(960) });
		await goals.completeFinishedGoals(NOW + 1);
		await updateBook("aaaaaaaa", { wordPosition: wordPos(100) });
		const later = await goals.createGoal(
			book("aaaaaaaa", { wordPosition: wordPos(100) }),
			{ mode: "pace", dailyPercent: 1 },
			NOW + 2,
		);
		await updateBook("aaaaaaaa", { wordPosition: wordPos(960) });
		await goals.deleteGoal(later.id, NOW + 3);
		expect(await goals.getReadingGoalPlan("aaaaaaaa", NOW + 4)).toBeNull();
	});

	it("does not fall back to a goal a newer one replaced", async () => {
		await goals.createGoal(book("aaaaaaaa"), { mode: "pace", dailyPercent: 1 }, NOW);
		const newer = await goals.createGoal(
			book("aaaaaaaa"),
			{ mode: "pace", dailyPercent: 2 },
			NOW + 1,
		);
		await goals.deleteGoal(newer.id, NOW + 2);
		expect(await goals.getReadingGoalPlan("aaaaaaaa", NOW + 3)).toBeNull();
	});

	it("returns null without an active goal", async () => {
		expect(await goals.getReadingGoalPlan("aaaaaaaa", NOW)).toBeNull();
	});

	it("plans from the stored goal, this book's sessions and speed", async () => {
		const goal = await goals.createGoal(
			book("aaaaaaaa"),
			{ mode: "deadline", targetDate: "2026-03-10" },
			NOW,
		);
		raw
			.prepare(
				`INSERT INTO reading_sessions
				 (id, book_id, mode, started_at, ended_at, duration_ms, words_read, start_word, end_word, wpm_avg, updated_at)
				 VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
			)
			.run(
				"s1",
				"aaaaaaaa",
				"scroll",
				NOW + 60_000,
				NOW + 120_000,
				60_000,
				200,
				0,
				200,
				null,
				NOW + 120_000,
			);
		await updateBook("aaaaaaaa", { wordPosition: wordPos(200) });

		const result = await goals.getReadingGoalPlan("aaaaaaaa", NOW + 180_000);
		expect(result?.goal.id).toBe(goal.id);
		if (result?.plan.kind !== "plan") throw new Error("expected a plan");
		expect(result.plan.progressToday.words).toBe(200);
		expect(result.plan.pace).toEqual({ wpm: 200, isMeasured: true });
		expect(result.plan.dailyTarget.minutes).toBeCloseTo(0.5);
	});

	it("switches mode through replanGoalById", async () => {
		const goal = await goals.createGoal(
			book("aaaaaaaa"),
			{ mode: "deadline", targetDate: "2026-03-10" },
			NOW,
		);
		await goals.replanGoalById(goal.id, { mode: "pace" }, NOW + 1);
		const stored = await goals.getActiveGoal("aaaaaaaa");
		expect(stored).toMatchObject({ mode: "pace", targetDate: "2026-03-10", updatedAt: NOW + 1 });
		expect(stored?.dailyPercent).toBeCloseTo(10);
	});
});
