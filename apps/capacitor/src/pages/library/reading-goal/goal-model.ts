/**
 * The goal UI's arithmetic and labels, kept out of the components so the
 * setup conversions and display states are testable without a renderer.
 * Plan math itself lives in services/stats/reading-goal.ts.
 */
import {
	addDays,
	inclusiveDays,
	isFinishedPosition,
	MIN_GOAL_DAILY_PERCENT,
} from "@lesefluss/core";
import type { ReadingGoal } from "../../../services/db/schema";
import {
	isDayMet,
	type NewGoalSpec,
	type ReadingGoalPlan,
} from "../../../services/stats/reading-goal";
import { localDateKey, localDateOfKey } from "../../../utils/date-utils";

export const MIN_GOAL_DAYS = 7;
export const MAX_GOAL_DAYS = 365;

/** Locked value: the date (deadline mode) or the daily amount (pace mode). */
export type GoalLock = "date" | "daily";

export const MISSED_DAY_LABEL: Record<ReadingGoal["mode"], string> = {
	deadline: "raise daily target",
	pace: "push finish date",
};

export function lockToMode(lock: GoalLock): ReadingGoal["mode"] {
	return lock === "date" ? "deadline" : "pace";
}

/** Serial chapters never get goal UI. */
export function canHaveGoal(book: { seriesId: string | null }): boolean {
	return book.seriesId === null;
}

/** A new goal also needs a known length and something left to read. */
export function canStartGoal(book: {
	seriesId: string | null;
	wordCount: number;
	wordPosition: number;
}): boolean {
	return (
		canHaveGoal(book) &&
		book.wordCount > 0 &&
		!isFinishedPosition(book.wordPosition, book.wordCount)
	);
}

/** Slider position 0..100 on a log scale from one week to one year. */
export function sliderToDays(position: number): number {
	const ratio = MAX_GOAL_DAYS / MIN_GOAL_DAYS;
	return Math.round(MIN_GOAL_DAYS * ratio ** (position / 100));
}

export function daysToSlider(days: number): number {
	const ratio = MAX_GOAL_DAYS / MIN_GOAL_DAYS;
	const position = (Math.log(days / MIN_GOAL_DAYS) / Math.log(ratio)) * 100;
	return Math.min(100, Math.max(0, Math.round(position)));
}

export type GoalPreset = { label: string; months: number };
export const GOAL_PRESETS: GoalPreset[] = [
	{ label: "1 month", months: 1 },
	{ label: "3 months", months: 3 },
	{ label: "6 months", months: 6 },
];

/** Days for a preset: through the day before the same date `months` later. */
export function presetDays(today: string, months: number): number {
	const target = localDateOfKey(today);
	if (!target) throw new Error(`invalid day key: ${today}`);
	target.setMonth(target.getMonth() + months);
	return inclusiveDays(today, localDateKey(target.getTime())) - 1;
}

/** What the sheet edits: which side is locked, the duration, and a daily percent kept as stored. */
export type GoalSetup = { lock: GoalLock; days: number; dailyPercent?: number };

export type SetupValues = {
	days: number;
	finishDate: string;
	dailyPercent: number;
	minutes: number;
};

/**
 * Both sides of the setup cards: daily percent and minutes, and the finish
 * date. A locked daily amount is held to the smallest a goal can store, and a
 * daily percent carried over from an existing goal wins over the duration; in
 * both cases the duration follows from the percent, as the plan will compute it.
 */
export function setupValues(
	setup: GoalSetup,
	book: { today: string; wordCount: number; wordPosition: number; wpm: number },
): SetupValues {
	const remaining = Math.max(0, book.wordCount - book.wordPosition);
	const remainingPercent = book.wordCount > 0 ? (remaining / book.wordCount) * 100 : 0;
	let days = Math.max(1, Math.round(setup.days));
	let dailyPercent = remainingPercent / days;
	if (setup.lock === "daily") {
		const pace = Math.max(MIN_GOAL_DAILY_PERCENT, setup.dailyPercent ?? dailyPercent);
		if (pace !== dailyPercent) {
			dailyPercent = pace;
			days = Math.max(1, Math.ceil(remainingPercent / pace));
		}
	}
	return {
		days,
		finishDate: addDays(book.today, days - 1),
		dailyPercent,
		minutes: ((dailyPercent / 100) * book.wordCount) / book.wpm,
	};
}

/** Rounded up so a pace goal never finishes after the date shown beside it. */
function storedDailyPercent(dailyPercent: number): number {
	return Math.ceil(dailyPercent * 100) / 100;
}

export function goalSpec(lock: GoalLock, values: SetupValues): NewGoalSpec {
	return lock === "date"
		? { mode: "deadline", targetDate: values.finishDate }
		: { mode: "pace", dailyPercent: storedDailyPercent(values.dailyPercent) };
}

export function newGoalSetup(today: string): GoalSetup {
	return { lock: "date", days: presetDays(today, 1) };
}

/** The sheet's starting state when editing: the goal's own date or daily percent. */
export function seedFromGoal(goal: ReadingGoal, plan: ReadingGoalPlan): GoalSetup {
	if (goal.mode === "deadline") {
		return { lock: "date", days: Math.max(1, inclusiveDays(plan.today, goal.targetDate)) };
	}
	return {
		lock: "daily",
		days: Math.max(1, inclusiveDays(plan.today, plan.projectedFinishDate)),
		dailyPercent: goal.dailyPercent,
	};
}

export type GoalTone = "ahead" | "behind" | "even";

export const GOAL_TONE_CLASS: Record<GoalTone, string> = {
	ahead: "text-[var(--goal-met)]",
	behind: "text-[var(--goal-pending)]",
	even: "",
};

/** Under a tenth of a day either way reads as even rather than flickering a sign. */
export function goalTone(plan: Pick<ReadingGoalPlan, "aheadBehind">): GoalTone {
	if (plan.aheadBehind.days >= 0.05) return "ahead";
	if (plan.aheadBehind.days <= -0.05) return "behind";
	return "even";
}

export type LiveToday = {
	progressWords: number;
	progressPercent: number;
	targetPercent: number;
	/** 0..1 share of today's target read. */
	fraction: number;
	isMet: boolean;
	minutesToGo: number;
};

/**
 * Today's progress at a position the plan has not seen yet: the reader's live
 * word, ahead of the last saved one. The target itself never moves within a day.
 * `furthestRead` is how far the reader's sittings have read today; with the
 * plan's furthest word it keeps the target met after moving back, before the
 * plan sees the sitting. Once the live word is saved it matches the plan.
 */
export function liveToday(
	plan: ReadingGoalPlan,
	word: number,
	wordCount: number,
	furthestRead: number | null = null,
): LiveToday {
	const target = plan.dailyTarget.words;
	const furthest = Math.max(word, plan.furthestTodayWord, furthestRead ?? 0);
	const progressWords = Math.max(0, furthest - plan.dayStartWord);
	const isMet = plan.isComplete || isDayMet(plan.dayStartWord, furthest, target, wordCount);
	return {
		progressWords,
		progressPercent: wordCount > 0 ? (progressWords / wordCount) * 100 : 0,
		targetPercent: plan.dailyTarget.percent,
		fraction: isMet ? 1 : target > 0 ? Math.min(1, progressWords / target) : 0,
		isMet,
		minutesToGo: isMet ? 0 : (target - progressWords) / plan.pace.wpm,
	};
}

/** Days met, today included once the live view sees it met, before the plan does. */
export function daysMetWithToday(plan: ReadingGoalPlan, today: LiveToday): number {
	return plan.daysTargetMet + (today.isMet && !plan.isTodayMet ? 1 : 0);
}

const MINUS = "−";

/** One decimal, signed with a real minus so it lines up with tabular figures. */
export function signed(value: number, unit: string): string {
	const rounded = Math.round(value * 10) / 10;
	if (rounded === 0) return `0.0${unit}`;
	return `${rounded > 0 ? "+" : MINUS}${Math.abs(rounded).toFixed(1)}${unit}`;
}
