import { describe, expect, it } from "vitest";
import type { ReadingGoalPlan, ReadingGoalPlanResult } from "../reading-goal";
import { formatGoalProgress, summarizeTodayGoals } from "../today-goal-summary";

function plan(fields: {
	dailyMinutes?: number | null;
	targetMinutes?: number;
	readMinutes?: number;
	isTodayMet?: boolean;
	isComplete?: boolean;
}): { plan: ReadingGoalPlanResult } {
	const p = {
		kind: "plan",
		dailyMinutes: fields.dailyMinutes ?? null,
		dailyTarget: { words: 0, percent: 0, minutes: fields.targetMinutes ?? 0 },
		progressToday: { words: 0, percent: 0, minutes: fields.readMinutes ?? 0 },
		isTodayMet: fields.isTodayMet ?? false,
		isComplete: fields.isComplete ?? false,
	} as Partial<ReadingGoalPlan> as ReadingGoalPlan;
	return { plan: p };
}

describe("summarizeTodayGoals", () => {
	it("is none without a goal that needs reading today", () => {
		expect(summarizeTodayGoals([])).toEqual({ kind: "none" });
		expect(
			summarizeTodayGoals([
				plan({ dailyMinutes: 20, isComplete: true }),
				{ plan: { kind: "unknown-length", daysRead: 2, isComplete: false } },
			]),
		).toEqual({ kind: "none" });
	});

	it("sums minute goals and word goals at their minutes", () => {
		const summary = summarizeTodayGoals([
			plan({ dailyMinutes: 20, readMinutes: 12 }),
			plan({ targetMinutes: 10, readMinutes: 7.5 }),
		]);
		expect(summary).toEqual({
			kind: "goals",
			minutesRead: 19.5,
			minutesNeeded: 30,
			fraction: 0.65,
			isMet: false,
		});
		if (summary.kind === "goals") expect(formatGoalProgress(summary)).toBe("19 of 30 min");
	});

	it("caps each goal at its own need, and a met goal counts in full", () => {
		const summary = summarizeTodayGoals([
			plan({ dailyMinutes: 20, readMinutes: 45, isTodayMet: true }),
			plan({ dailyMinutes: 10, readMinutes: 0 }),
		]);
		expect(summary).toMatchObject({ minutesRead: 20, minutesNeeded: 30, isMet: false });
	});

	it("is met once every goal is met", () => {
		const summary = summarizeTodayGoals([
			plan({ dailyMinutes: 20, readMinutes: 20, isTodayMet: true }),
			plan({ targetMinutes: 8.2, readMinutes: 3, isTodayMet: true }),
		]);
		expect(summary).toMatchObject({ fraction: 1, isMet: true });
		if (summary.kind === "goals") expect(formatGoalProgress(summary)).toBe("29 of 29 min");
	});
});
