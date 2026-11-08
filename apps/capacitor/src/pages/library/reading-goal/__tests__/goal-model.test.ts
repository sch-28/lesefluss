import { inclusiveDays } from "@lesefluss/core";
import { describe, expect, it } from "vitest";
import { newGoalPlanFields } from "../../../../services/stats/reading-goal";
import {
	canStartGoal,
	daysMetWithToday,
	daysToSlider,
	finishAtMinutes,
	goalAmountLabel,
	goalSpec,
	goalTone,
	liveToday,
	MAX_GOAL_DAYS,
	MIN_GOAL_DAYS,
	minutesForDays,
	newGoalSetup,
	presetDays,
	rsvpComparison,
	seedFromGoal,
	setupValues,
	signed,
	sliderToDays,
	switchGoalUnit,
	todayFigure,
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
		expect(goalSpec("daily", values)).toEqual({
			mode: "pace",
			dailyPercent: 3.34,
			dailyMinutes: null,
		});
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
		expect(goalSpec("daily", values)).toEqual({
			mode: "pace",
			dailyPercent: 2,
			dailyMinutes: null,
		});
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

describe("minute goals", () => {
	it("derives the daily percent and the finish from the minutes at the reader's pace", () => {
		// 20 min × 10 wpm = 200 words = 20% a day: the 1,000 words take 5 days.
		const values = setupValues({ lock: "daily", days: 30, dailyMinutes: 20 }, book(0, 10));
		expect(values).toMatchObject({ dailyMinutes: 20, minutes: 20, days: 5 });
		expect(values.dailyPercent).toBeCloseTo(20);
		expect(values.finishDate).toBe("2026-03-05");
		expect(goalSpec("daily", values)).toEqual({ mode: "pace", dailyPercent: 20, dailyMinutes: 20 });
	});

	it("shows the setup's finish on the goal it saves, for a long book at a fractional pace", () => {
		const long = { today: "2026-11-07", wordCount: 1_267_069, wordPosition: 1_000, wpm: 247.3 };
		const values = setupValues({ lock: "daily", days: 30, dailyMinutes: 30 }, long);
		const spec = goalSpec("daily", values);
		expect(spec).toMatchObject({ dailyPercent: values.dailyPercent });
		if (spec.mode !== "pace") throw new Error("expected a pace goal");
		const created = new Date(2026, 10, 7, 10).getTime();
		const fields = newGoalPlanFields(spec, long.wordPosition, long.wordCount, created);
		expect(fields.targetDate).toBe(values.finishDate);
		expect(inclusiveDays(long.today, values.finishDate)).toBe(values.days);
	});

	it("turns a duration into whole minutes that never finish later", () => {
		expect(minutesForDays(3, book(0, 10))).toBe(34);
		expect(minutesForDays(1000, book(0, 200))).toBe(1);
	});

	it("reopens a minute goal on its minutes", () => {
		const goal = makeGoal({ mode: "pace", dailyPercent: 20, dailyMinutes: 20 });
		const plan = makePlan({ goal, position: 0 });
		expect(seedFromGoal(goal, plan)).toMatchObject({ lock: "daily", dailyMinutes: 20 });
	});

	it("reopens a minute goal on the finish its card shows, even after the pace has changed", () => {
		const goal = makeGoal({ mode: "pace", dailyPercent: 20, dailyMinutes: 20 });
		const seed = seedFromGoal(goal, makePlan({ goal, position: 0 }));
		const faster = book(0, 20);
		expect(setupValues(seed, faster)).toMatchObject({ dailyPercent: 20, days: 5 });
		const edited = setupValues({ lock: "daily", days: 5, dailyMinutes: 20 }, faster);
		expect(edited).toMatchObject({ dailyPercent: 40, days: 3 });
	});

	it("shows the RSVP finish at the same minutes only when it is earlier", () => {
		const values = setupValues({ lock: "daily", days: 30, dailyMinutes: 20 }, book(0, 10));
		expect(finishAtMinutes(20, 25, book(0))).toBe("2026-03-02");
		expect(rsvpComparison(values, book(0, 10), 25)?.value).toMatch(/^Done /);
		expect(rsvpComparison(values, book(0, 10), 10)).toBeNull();
		// 11 wpm still needs 5 days: no earlier finish, no hint.
		expect(rsvpComparison(values, book(0, 10), 11)).toBeNull();
	});

	it("hides a percent goal's RSVP row when it rounds to the normal minutes", () => {
		const values = setupValues({ lock: "date", days: 10 }, book(0, 200));
		expect(rsvpComparison(values, book(0, 200), 201)).toBeNull();
	});

	it("shows a percent goal's RSVP minutes a day, terse", () => {
		const values = setupValues({ lock: "date", days: 10 }, book(0, 10));
		// 100 words a day: 10 min at 10 wpm, 5 min at 20.
		expect(rsvpComparison(values, book(0, 10), 20)).toEqual({
			wpm: 20,
			value: "5 min a day",
		});
	});

	it("counts today's minutes on the card and chip, not the words", () => {
		const goal = makeGoal({ mode: "pace", dailyPercent: 20, dailyMinutes: 20 });
		const plan = makePlan({
			goal,
			position: 10,
			sessions: [{ ...session(1, 0, 10), durationMs: 12 * 60_000 }],
			now: at(1, 21),
		});
		const today = liveToday(plan, 10, WORDS);
		expect(today).toMatchObject({ targetMinutes: 20, isMet: false });
		expect(today.minutesRead).toBeCloseTo(12);
		expect(today.minutesToGo).toBeCloseTo(8);
		expect(today.fraction).toBeCloseTo(0.6);
		expect(todayFigure(today)).toEqual({ done: "12", target: "20 min" });
	});

	it("keeps a percent goal's figure in percent", () => {
		const plan = makePlan({ position: 50, sessions: [session(1, 0, 50)], now: at(1, 21) });
		expect(todayFigure(liveToday(plan, 50, WORDS))).toEqual({ done: "5.0", target: "10.0%" });
	});
});

describe("switchGoalUnit", () => {
	const b = book(0, 250);

	it("restores the preset and duration when switching straight back", () => {
		const start = { lock: "date" as const, days: presetDays(b.today, 1) };
		const toMinutes = switchGoalUnit(start, "minutes", setupValues(start, b), null);
		expect(toMinutes.setup).toMatchObject({ lock: "daily" });
		const back = switchGoalUnit(
			toMinutes.setup,
			"percent",
			setupValues(toMinutes.setup, b),
			toMinutes.last,
		);
		expect(back.setup).toBe(start);
		expect(back.last).toBeNull();
	});

	it("builds a fresh setup once the user edited after switching", () => {
		const start = { lock: "date" as const, days: 30 };
		const toMinutes = switchGoalUnit(start, "minutes", setupValues(start, b), null);
		const edited = { lock: "daily" as const, days: 20, dailyMinutes: 15 };
		const back = switchGoalUnit(edited, "percent", setupValues(edited, b), toMinutes.last);
		expect(back.setup).not.toBe(start);
		expect(back.setup).toMatchObject({ lock: "daily", dailyPercent: expect.any(Number) });
	});
});

describe("goalAmountLabel", () => {
	it("leads a minute goal with its minutes and a percent goal with its percent", () => {
		const minuteGoal = makeGoal({ mode: "pace", dailyMinutes: 20, dailyPercent: 5 });
		const minutePlan = { ...makePlan({ position: 0 }), dailyMinutes: 20 };
		expect(goalAmountLabel(minuteGoal, minutePlan)).toMatch(/^20 min a day · /);
		const percentGoal = makeGoal({ mode: "pace", dailyPercent: 5, dailyMinutes: null });
		const percentPlan = { ...makePlan({ position: 0 }), dailyMinutes: null };
		expect(goalAmountLabel(percentGoal, percentPlan)).toMatch(/^5(\.0)?% a day · /);
		expect(goalAmountLabel(makeGoal(), makePlan({ position: 0 }))).toMatch(/^By .+ a day$/);
	});
});
