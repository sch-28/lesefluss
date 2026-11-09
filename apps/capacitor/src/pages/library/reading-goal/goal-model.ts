/**
 * The goal UI's arithmetic and labels, kept out of the components so the
 * setup conversions and display states are testable without a renderer.
 * Plan math itself lives in services/stats/reading-goal.ts.
 */
import {
	addDays,
	inclusiveDays,
	isFinishedPosition,
	MAX_GOAL_DAILY_MINUTES,
	MIN_GOAL_DAILY_MINUTES,
	MIN_GOAL_DAILY_PERCENT,
} from "@lesefluss/core";
import type { ReadingGoal } from "../../../services/db/schema";
import {
	isDayMet,
	type NewGoalSpec,
	paceTargetDate,
	type ReadingGoalPlan,
} from "../../../services/stats/reading-goal";
import { goalProgressMinutes } from "../../../services/stats/today-goal-summary";
import { formatDayKey, localDateKey, localDateOfKey } from "../../../utils/date-utils";
import { minutesLabel, percentLabel } from "../../../utils/reading-time";

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

/** Books a goal can start on that have none yet, in the order given (the library's: most recently read first). */
export function goalCandidates<B extends { id: string } & Parameters<typeof canStartGoal>[0]>(
	books: readonly B[],
	goalBookIds: readonly string[],
): B[] {
	const taken = new Set(goalBookIds);
	return books.filter((book) => canStartGoal(book) && !taken.has(book.id));
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

/**
 * What the sheet edits: which side is locked, the duration, and a daily percent
 * kept as stored. `dailyMinutes` makes a locked daily amount a minute goal.
 */
export type GoalSetup = {
	lock: GoalLock;
	days: number;
	dailyPercent?: number;
	dailyMinutes?: number | null;
};

export type SetupValues = {
	days: number;
	finishDate: string;
	dailyPercent: number;
	minutes: number;
	/** Set for a minute goal only. */
	dailyMinutes: number | null;
};

export const MINUTE_PRESETS = [10, 20, 30, 60] as const;

export function isMinuteSetup(setup: GoalSetup): boolean {
	return setup.lock === "daily" && setup.dailyMinutes != null;
}

/** Whole minutes a day that read the rest within `days`, rounded up so the finish is never later. */
export function minutesForDays(
	days: number,
	book: { wordCount: number; wordPosition: number; wpm: number },
): number {
	const remaining = Math.max(0, book.wordCount - book.wordPosition);
	const minutes = Math.ceil(remaining / Math.max(1, days) / book.wpm);
	return Math.min(MAX_GOAL_DAILY_MINUTES, Math.max(MIN_GOAL_DAILY_MINUTES, minutes));
}

/** The day `minutes` a day at `wpm` finish the rest, the first day being `today`. */
export function finishAtMinutes(
	minutes: number,
	wpm: number,
	book: { today: string; wordCount: number; wordPosition: number },
): string {
	const remaining = Math.max(0, book.wordCount - book.wordPosition);
	const perDay = Math.max(1, minutes * wpm);
	return addDays(book.today, Math.max(1, Math.ceil(remaining / perDay)) - 1);
}

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
	if (isMinuteSetup(setup) && setup.dailyMinutes != null && book.wordCount > 0) {
		const dailyMinutes = setup.dailyMinutes;
		// A reopened goal keeps the percent it was set with, as its card and chart do; a pace
		// change since then only moves the finish once the minutes are edited.
		const dailyPercent =
			setup.dailyPercent ??
			storedDailyPercent(
				Math.max(MIN_GOAL_DAILY_PERCENT, ((dailyMinutes * book.wpm) / book.wordCount) * 100),
			);
		const finishDate = paceTargetDate(book.today, book.wordPosition, dailyPercent, book.wordCount);
		return {
			days: inclusiveDays(book.today, finishDate),
			finishDate,
			dailyPercent,
			minutes: dailyMinutes,
			dailyMinutes,
		};
	}
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
		dailyMinutes: null,
	};
}

/**
 * Rounded up so a pace goal never finishes after the date shown beside it.
 * Idempotent: the rounding drops float noise first, so 1.1 stays 1.1.
 */
function storedDailyPercent(dailyPercent: number): number {
	return Math.ceil(Math.round(dailyPercent * 1e6) / 1e4) / 100;
}

/**
 * The setup's RSVP hint at the reader's RSVP speed: a minute goal's earlier
 * finish at the same minutes, otherwise the minutes a day the same daily amount
 * takes. `wpm` is the speed the estimate used, so the label never shows another.
 * Null when RSVP would not be faster than the reader's pace.
 */
export function rsvpComparison(
	values: SetupValues,
	book: { today: string; wordCount: number; wordPosition: number; wpm: number },
	rsvpWpm: number,
): { wpm: number; value: string } | null {
	if (book.wordCount <= 0 || rsvpWpm <= book.wpm) return null;
	const wpm = Math.round(rsvpWpm);
	if (values.dailyMinutes != null) {
		const finish = finishAtMinutes(values.dailyMinutes, rsvpWpm, book);
		return finish < values.finishDate ? { wpm, value: `Done ${formatDayKey(finish)}` } : null;
	}
	const rsvpMinutes = minutesLabel((values.minutes * book.wpm) / rsvpWpm);
	return rsvpMinutes === minutesLabel(values.minutes)
		? null
		: { wpm, value: `${rsvpMinutes} a day` };
}

export type GoalUnit = "percent" | "minutes";

/** The setup before a unit switch and the one it produced, so switching straight back restores it. */
export type UnitSwitch = { from: GoalSetup; to: GoalSetup };

/**
 * A minute goal rounds to whole minutes, which moves the finish by a day or so;
 * switching straight back returns the setup as it was, duration and preset included.
 */
export function switchGoalUnit(
	setup: GoalSetup,
	unit: GoalUnit,
	values: SetupValues,
	last: UnitSwitch | null,
): { setup: GoalSetup; last: UnitSwitch | null } {
	if (last && last.to === setup) return { setup: last.from, last: null };
	const next: GoalSetup =
		unit === "minutes"
			? { lock: "daily", days: values.days, dailyMinutes: Math.max(1, Math.round(values.minutes)) }
			: { lock: "daily", days: values.days, dailyPercent: values.dailyPercent };
	return { setup: next, last: { from: setup, to: next } };
}

export function goalSpec(lock: GoalLock, values: SetupValues): NewGoalSpec {
	return lock === "date"
		? { mode: "deadline", targetDate: values.finishDate }
		: {
				mode: "pace",
				dailyPercent: storedDailyPercent(values.dailyPercent),
				dailyMinutes: values.dailyMinutes,
			};
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
		dailyMinutes: goal.dailyMinutes,
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
	/** A minute goal's target and today's active minutes so far; targetMinutes is null otherwise. */
	targetMinutes: number | null;
	minutesRead: number;
	/** Today's need in minutes, a percent goal's at the reader's pace. */
	minutesNeeded: number;
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
	const progressPercent = wordCount > 0 ? (progressWords / wordCount) * 100 : 0;
	const minutesRead = plan.progressToday.minutes;
	if (plan.dailyMinutes != null) {
		// Minutes come from saved sittings only, so they lag the live word by up to a heartbeat.
		const isMet =
			plan.isComplete || plan.isTodayMet || isDayMet(plan.dayStartWord, furthest, 0, wordCount);
		return {
			progressWords,
			progressPercent,
			targetPercent: plan.dailyTarget.percent,
			fraction: isMet ? 1 : Math.min(1, minutesRead / plan.dailyMinutes),
			isMet,
			minutesToGo: isMet ? 0 : Math.max(0, plan.dailyMinutes - minutesRead),
			targetMinutes: plan.dailyMinutes,
			minutesRead,
			minutesNeeded: plan.dailyMinutes,
		};
	}
	const isMet = plan.isComplete || isDayMet(plan.dayStartWord, furthest, target, wordCount);
	return {
		progressWords,
		progressPercent,
		targetPercent: plan.dailyTarget.percent,
		fraction: isMet ? 1 : target > 0 ? Math.min(1, progressWords / target) : 0,
		isMet,
		minutesToGo: isMet ? 0 : (target - progressWords) / plan.pace.wpm,
		targetMinutes: null,
		minutesRead: progressWords / plan.pace.wpm,
		minutesNeeded: plan.dailyTarget.minutes,
	};
}

/** Today's minutes against the need, as formatGoalProgress shows them on every other screen. */
export function todayFigure(today: LiveToday): { done: string; target: string } {
	const { read, needed } = goalProgressMinutes(today);
	return { done: String(read), target: `${needed} min` };
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

/** A minute goal names its minutes and a percent goal its percent, each with the other figure. */
export function goalAmountLabel(goal: ReadingGoal, plan: ReadingGoalPlan): string {
	if (plan.dailyMinutes != null) {
		return `${Math.round(plan.dailyMinutes)} min a day · ${percentLabel(plan.dailyTarget.percent)}%`;
	}
	if (goal.mode === "pace") {
		return `${percentLabel(goal.dailyPercent)}% a day · ${minutesLabel(plan.dailyTarget.minutes)}`;
	}
	return `By ${formatDayKey(goal.targetDate)} · ${minutesLabel(plan.dailyTarget.minutes)} a day`;
}
