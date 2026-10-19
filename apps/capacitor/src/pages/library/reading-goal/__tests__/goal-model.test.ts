import { describe, expect, it } from "vitest";
import {
	canStartGoal,
	daysMetWithToday,
	daysToSlider,
	goalSpec,
	goalTone,
	liveToday,
	MAX_GOAL_DAYS,
	MIN_GOAL_DAYS,
	newGoalSetup,
	presetDays,
	seedFromGoal,
	setupValues,
	signed,
	sliderToDays,
} from "../goal-model";
import { at, makeGoal, makePlan, session, WORDS } from "./goal-fixtures";

const book = (wordPosition: number, wpm = 200) => ({
	today: "2026-03-01",
	wordCount: WORDS,
	wordPosition,
	wpm,
});

describe("setup conversions", () => {
	it("maps the slider ends to one week and one year on a log scale", () => {
		expect(sliderToDays(0)).toBe(MIN_GOAL_DAYS);
		expect(sliderToDays(100)).toBe(MAX_GOAL_DAYS);
		// Halfway on a log scale is the geometric mean, about seven weeks.
		expect(sliderToDays(50)).toBe(51);
		for (const days of [7, 30, 91, 182, 365]) {
			expect(Math.abs(sliderToDays(daysToSlider(days)) - days) / days).toBeLessThan(0.05);
		}
	});

	it("turns a duration into a daily percent, minutes at the reader's pace and a finish date", () => {
		const values = setupValues({ lock: "date", days: 10 }, book(200));
		expect(values.dailyPercent).toBeCloseTo(8);
		expect(values.minutes).toBeCloseTo(0.4);
		expect(values.finishDate).toBe("2026-03-10");
	});

	it("counts calendar months for the presets, and opens a new goal on one month", () => {
		expect(presetDays("2026-01-31", 1)).toBe(31);
		expect(presetDays("2026-10-19", 3)).toBe(92);
		expect(newGoalSetup("2026-03-01")).toEqual({ lock: "date", days: 31 });
	});

	it("locks the date as a deadline goal and the daily amount as a pace goal", () => {
		const values = setupValues({ lock: "daily", days: 30 }, book(0, 225));
		expect(goalSpec("date", values)).toEqual({ mode: "deadline", targetDate: "2026-03-30" });
		// 3.333...% rounds up so the pace never lands after the date shown beside it.
		expect(goalSpec("daily", values)).toEqual({ mode: "pace", dailyPercent: 3.34 });
	});

	it("holds a locked daily amount to the smallest a goal can store and moves the date", () => {
		const values = setupValues({ lock: "daily", days: 365 }, book(800));
		expect(values.dailyPercent).toBe(0.1);
		expect(values.days).toBe(200);
		expect(values.finishDate).toBe("2026-09-16");
		// A locked date keeps its duration, however small the daily share.
		expect(setupValues({ lock: "date", days: 365 }, book(800)).days).toBe(365);
	});

	it("reopens a pace goal on its stored percent, so saving unchanged changes nothing", () => {
		const goal = makeGoal({ mode: "pace", dailyPercent: 2 });
		const plan = makePlan({ goal, position: 10, sessions: [session(1, 0, 10)], now: at(1, 21) });
		const seed = seedFromGoal(goal, plan);
		expect(seed).toMatchObject({ lock: "daily", dailyPercent: 2 });
		const values = setupValues(seed, { ...book(plan.dayStartWord), today: plan.today });
		expect(values.dailyPercent).toBe(2);
		expect(values.finishDate).toBe(plan.projectedFinishDate);
		expect(goalSpec("daily", values)).toEqual({ mode: "pace", dailyPercent: 2 });
	});

	it("reopens a deadline goal on its target date", () => {
		const plan = makePlan({ position: 0 });
		expect(seedFromGoal(makeGoal(), plan)).toEqual({ lock: "date", days: 10 });
	});

	it("offers a new goal only for a book with a length and something left to read", () => {
		expect(canStartGoal({ seriesId: null, wordCount: WORDS, wordPosition: 0 })).toBe(true);
		expect(canStartGoal({ seriesId: "s", wordCount: WORDS, wordPosition: 0 })).toBe(false);
		expect(canStartGoal({ seriesId: null, wordCount: 0, wordPosition: 0 })).toBe(false);
		expect(canStartGoal({ seriesId: null, wordCount: WORDS, wordPosition: 950 })).toBe(false);
	});
});

describe("display states", () => {
	it("is on track before today's reading when every earlier day was met", () => {
		const plan = makePlan({ position: 100, sessions: [session(1, 0, 100)], now: at(2, 8) });
		const today = liveToday(plan, 100, WORDS);
		expect(goalTone(plan)).toBe("even");
		expect(today).toMatchObject({ progressWords: 0, fraction: 0, isMet: false });
		expect(today.minutesToGo).toBeCloseTo(0.5);
	});

	it("is behind after a missed day", () => {
		const plan = makePlan({ position: 0, now: at(3) });
		expect(goalTone(plan)).toBe("behind");
		expect(signed(plan.aheadBehind.days, " d")).toBe("−2.0 d");
	});

	it("is ahead when earlier reading went past the plan", () => {
		const plan = makePlan({ position: 400, sessions: [session(1, 0, 400)], now: at(2, 8) });
		expect(goalTone(plan)).toBe("ahead");
		expect(signed(plan.aheadBehind.percent, "%")).toBe("+20.0%");
	});

	it("counts today as met from the live position, before the plan has seen it", () => {
		const plan = makePlan({ position: 0, now: at(1, 13) });
		expect(liveToday(plan, 60, WORDS)).toMatchObject({ fraction: 0.6, isMet: false });
		expect(liveToday(plan, 130, WORDS)).toMatchObject({ fraction: 1, isMet: true, minutesToGo: 0 });
	});

	it("stays met when the position moves back after today's reading reached the target", () => {
		const saved = makePlan({ position: 90, sessions: [session(1, 0, 130)], now: at(1, 21) });
		expect(liveToday(saved, 90, WORDS)).toMatchObject({ progressWords: 130, isMet: true });
		// The open sitting's reading counts before its row reaches the plan.
		const open = makePlan({ position: 0, now: at(1, 13) });
		expect(liveToday(open, 40, WORDS, 130)).toMatchObject({ progressWords: 130, isMet: true });
	});

	it("shows a jump ahead as met only while the position is there", () => {
		const plan = makePlan({ position: 0, now: at(1, 13) });
		expect(liveToday(plan, 400, WORDS, 50).isMet).toBe(true);
		expect(liveToday(plan, 40, WORDS, 50)).toMatchObject({ progressWords: 50, isMet: false });
	});

	it("counts today among the days met as soon as the live view sees it met", () => {
		const plan = makePlan({ position: 0, now: at(1, 13) });
		expect(daysMetWithToday(plan, liveToday(plan, 40, WORDS))).toBe(plan.daysTargetMet);
		expect(daysMetWithToday(plan, liveToday(plan, 130, WORDS))).toBe(plan.daysTargetMet + 1);
		const saved = makePlan({ position: 130, now: at(1, 13) });
		expect(daysMetWithToday(saved, liveToday(saved, 130, WORDS))).toBe(saved.daysTargetMet);
	});

	it("is met for good once the goal is completed", () => {
		const plan = makePlan({
			goal: makeGoal({ status: "completed", completedAt: at(4) }),
			position: 960,
			now: at(5),
		});
		expect(plan.isComplete).toBe(true);
		expect(liveToday(plan, 960, WORDS)).toMatchObject({ isMet: true, fraction: 1 });
	});
});
