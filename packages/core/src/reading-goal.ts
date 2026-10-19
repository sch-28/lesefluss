import { requireDayNumber } from "./day-key";

/**
 * How a goal reacts to a missed day. `deadline` keeps the target date and raises
 * the daily target; `pace` keeps the daily target and moves the finish date.
 */
export const READING_GOAL_MODES = ["deadline", "pace"] as const;
export type ReadingGoalMode = (typeof READING_GOAL_MODES)[number];

/** A removed goal is a tombstone (`deleted`), not a status. */
export const READING_GOAL_STATUSES = ["active", "completed", "abandoned"] as const;
export type ReadingGoalStatus = (typeof READING_GOAL_STATUSES)[number];

/** Smallest and largest daily target a reader can set, in percent of the book. */
export const MIN_GOAL_DAILY_PERCENT = 0.1;
export const MAX_GOAL_DAILY_PERCENT = 100;

/** A reminder's local time of day, "HH:MM" on a 24-hour clock. */
export const REMINDER_TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The goal fields the plan line depends on. */
export type GoalLineParams = {
	mode: ReadingGoalMode;
	planStartDate: string;
	planStartWord: number;
	targetDate: string;
	dailyPercent: number;
};

/** Whole words for a daily percent; never zero, or a pace plan would never end. */
export function goalDailyWords(dailyPercent: number, wordCount: number): number {
	return Math.max(1, Math.round((dailyPercent / 100) * wordCount));
}

/** The pace plan's last day (a day number) from a position at the start of `fromDay`. */
export function paceFinishDay(
	fromDay: number,
	fromWord: number,
	dailyWords: number,
	wordCount: number,
): number {
	const remaining = Math.max(0, wordCount - fromWord);
	return fromDay + Math.max(1, Math.ceil(remaining / dailyWords)) - 1;
}

export type GoalPlanLine = {
	planStartDay: number;
	/** Deadline: the target date. Pace: the day the baseline plan finishes. */
	targetDay: number;
	/** Planned words per day. */
	slope: number;
	/** Planned position at the end of a day number. */
	at: (dayNumber: number) => number;
};

/**
 * The straight line from the plan's baseline: to the whole book on the target
 * date (deadline), or at the daily amount per day (pace). Days are day numbers
 * of local calendar keys, so the same goal draws the same line anywhere.
 */
export function goalPlanLine(goal: GoalLineParams, wordCount: number): GoalPlanLine {
	const planStartDay = requireDayNumber(goal.planStartDate);
	const base = goal.planStartWord;
	const dailyWords = goalDailyWords(goal.dailyPercent, wordCount);
	const targetDay =
		goal.mode === "deadline"
			? requireDayNumber(goal.targetDate)
			: paceFinishDay(planStartDay, base, dailyWords, wordCount);
	const span = targetDay - planStartDay + 1;
	const slope =
		goal.mode === "pace" ? dailyWords : span > 0 ? Math.max(0, wordCount - base) / span : 0;
	const at = (dayNumber: number): number => {
		const elapsed = dayNumber - planStartDay + 1;
		if (elapsed <= 0) return base;
		if (goal.mode === "pace") return Math.min(wordCount, base + dailyWords * elapsed);
		if (span <= 0 || elapsed >= span) return Math.max(base, wordCount);
		return base + slope * elapsed;
	};
	return { planStartDay, targetDay, slope, at };
}

/**
 * How far `position` is from the plan line on the day `today` (a day number):
 * ahead by what lies past the end of today's plan, behind by what is missing
 * from the end of yesterday's. A reader who met every earlier day and has not
 * read yet today is exactly on track.
 */
export function goalAheadBehind(
	line: GoalPlanLine,
	position: number,
	today: number,
	wordCount: number,
): { words: number; percent: number; days: number } {
	const planToday = line.at(today);
	const words =
		position >= planToday ? position - planToday : Math.min(0, position - line.at(today - 1));
	return {
		words,
		percent: wordCount > 0 ? (words / wordCount) * 100 : 0,
		days: line.slope > 0 ? words / line.slope : 0,
	};
}
