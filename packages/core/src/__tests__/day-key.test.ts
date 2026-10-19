import { describe, expect, test } from "vitest";
import { addDays, dayKeyOf, dayNumberOf, isDayKey } from "../day-key";
import { type SyncReadingGoal, SyncReadingGoalSchema } from "../sync";

describe("day keys", () => {
	test("round-trip through day numbers", () => {
		const day = dayNumberOf("2026-03-29");
		expect(day).not.toBeNull();
		expect(dayKeyOf(day ?? 0)).toBe("2026-03-29");
	});

	test("reject impossible and malformed dates", () => {
		for (const key of ["2026-02-31", "0000-99-99", "2026-13-01", "2026-3-1", "", "2026-03-01T00"]) {
			expect(isDayKey(key)).toBe(false);
		}
		expect(isDayKey("2024-02-29")).toBe(true);
	});

	test("addDays crosses months, years and leap days", () => {
		expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
		expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
		expect(() => addDays("2026-02-31", 1)).toThrow();
	});
});

describe("SyncReadingGoalSchema", () => {
	const valid: SyncReadingGoal = {
		goalId: "g1",
		bookId: "deadbeef",
		mode: "pace",
		status: "active",
		startedAt: 1_000,
		startWord: 0,
		planStartDate: "2026-03-01",
		planStartWord: 0,
		targetDate: "2026-03-10",
		dailyPercent: 10,
		carriedDaysMet: 0,
		completedAt: null,
		reminderTime: null,
		deleted: false,
		createdAt: 1_000,
		updatedAt: 1_000,
	};

	test("accepts a valid goal", () => {
		expect(SyncReadingGoalSchema.safeParse(valid).success).toBe(true);
	});

	test.each([
		["an impossible target date", { targetDate: "2026-02-31" }],
		["a word position past Postgres integer", { startWord: 2_147_483_648 }],
		["a day count past Postgres integer", { carriedDaysMet: 2_147_483_648 }],
		["a timestamp no Date can hold", { updatedAt: 8.64e15 + 1 }],
	])("rejects %s", (_, override) => {
		expect(SyncReadingGoalSchema.safeParse({ ...valid, ...override }).success).toBe(false);
	});
});
