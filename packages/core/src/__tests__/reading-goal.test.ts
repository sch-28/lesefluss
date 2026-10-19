import { describe, expect, test } from "vitest";
import { dayNumberOf } from "../day-key";
import { goalAheadBehind, goalDailyWords, goalPlanLine, paceFinishDay } from "../reading-goal";

const day = (key: string) => dayNumberOf(key) ?? Number.NaN;

const deadline = {
	mode: "deadline" as const,
	planStartDate: "2026-03-01",
	planStartWord: 0,
	targetDate: "2026-03-10",
	dailyPercent: 10,
};

describe("goal plan line", () => {
	test("a deadline line reaches the whole book on the target date", () => {
		const line = goalPlanLine(deadline, 1000);
		expect(line.slope).toBe(100);
		expect(line.at(day("2026-02-28"))).toBe(0);
		expect(line.at(day("2026-03-01"))).toBe(100);
		expect(line.at(day("2026-03-10"))).toBe(1000);
		expect(line.at(day("2026-03-20"))).toBe(1000);
	});

	test("a pace line moves the daily amount and stops at the end of the book", () => {
		const line = goalPlanLine({ ...deadline, mode: "pace", dailyPercent: 30 }, 1000);
		expect(line.slope).toBe(300);
		expect(line.targetDay).toBe(day("2026-03-04"));
		expect(line.at(day("2026-03-04"))).toBe(1000);
	});

	test("daily words never round to zero, so a pace plan always ends", () => {
		expect(goalDailyWords(0.1, 100)).toBe(1);
		expect(paceFinishDay(10, 0, 1, 100)).toBe(109);
	});
});

describe("ahead and behind", () => {
	const line = goalPlanLine(deadline, 1000);

	test("is zero for a reader who met every earlier day and has not read today", () => {
		expect(goalAheadBehind(line, 100, day("2026-03-02"), 1000)).toEqual({
			words: 0,
			percent: 0,
			days: 0,
		});
	});

	test("counts reading past today's plan as ahead and a missed day as behind", () => {
		expect(goalAheadBehind(line, 350, day("2026-03-02"), 1000)).toEqual({
			words: 150,
			percent: 15,
			days: 1.5,
		});
		expect(goalAheadBehind(line, 0, day("2026-03-02"), 1000)).toEqual({
			words: -100,
			percent: -10,
			days: -1,
		});
	});
});
