/**
 * Plan arithmetic for per-book reading goals. Pure: every surface that shows a
 * goal reads it from `planReadingGoal`, so the rules live in one tested place.
 *
 * Work is done in words and converted to percent of the book at the edge.
 * Days are local calendar days, counted by calendar arithmetic on `YYYY-MM-DD`
 * keys, so DST never shifts a day.
 */
import {
	addDays,
	dayKeyOf,
	goalAheadBehind,
	goalDailyWords,
	goalPlanLine,
	inclusiveDays,
	isFinishedPosition,
	MAX_GOAL_DAILY_PERCENT,
	MIN_GOAL_DAILY_PERCENT,
	paceFinishDay,
	type ReadingGoalMode,
	requireDayNumber,
	wordPos,
} from "@lesefluss/core";
import { localDateKey } from "../../utils/date-utils";
import { type ReadingPace, readingPace } from "../../utils/reading-time";
import type { ReadingGoal } from "../db/schema";

export type GoalParams = Pick<
	ReadingGoal,
	| "mode"
	| "status"
	| "startedAt"
	| "startWord"
	| "planStartDate"
	| "planStartWord"
	| "targetDate"
	| "dailyPercent"
	| "carriedDaysMet"
	| "completedAt"
>;

export type GoalSession = {
	startedAt: number;
	endedAt: number;
	startWord: number;
	endWord: number;
	/** Highest word read in the sitting; null on rows from before it was recorded. */
	furthestWord?: number | null;
	wordsRead: number;
};

export type GoalPlanInput = {
	goal: GoalParams;
	book: { wordCount: number; wordPosition: number };
	/** This book's sessions, any order. */
	sessions: GoalSession[];
	bookWpm: number | null;
	globalWpm: number | null;
	now: number;
};

export type GoalAmount = {
	words: number;
	percent: number;
	minutes: number;
};

/** Position at the end of `date`, in percent of the book. */
export type GoalSeriesPoint = {
	date: string;
	percent: number;
};

export type ReadingGoalPlan = {
	kind: "plan";
	mode: ReadingGoalMode;
	today: string;
	targetDate: string;
	/** Deadline: the target date. Pace: the day the remaining work ends at the daily rate. */
	projectedFinishDate: string;
	/** Days from today through the projected finish, today included. 0 once complete. */
	daysLeft: number;
	/** Goal completed, or the position reached the finished threshold. */
	isComplete: boolean;
	percentRead: number;
	/** Fixed for the whole local day: derived from the start-of-day position only. */
	dailyTarget: GoalAmount;
	dayStartWord: number;
	/** Furthest word today's reading reached; today's progress and whether it is met latch on it. */
	furthestTodayWord: number;
	progressToday: GoalAmount;
	isTodayMet: boolean;
	/** Signed, against the plan line. Positive = ahead. */
	aheadBehind: { words: number; percent: number; days: number };
	daysTargetMet: number;
	daysRead: number;
	pace: ReadingPace;
	/** End-of-day plan positions; the first point is the baseline, dated the day before the plan starts. */
	planSeries: GoalSeriesPoint[];
	/** End-of-day actual positions over the same span, through today. */
	actualSeries: GoalSeriesPoint[];
	/**
	 * Reading before the plan began (the goal's start, or its last replan), as
	 * end-of-day positions from this book's sessions, ending where the plan line
	 * starts. Context only: never judged. Empty without earlier sessions.
	 */
	historySeries: GoalSeriesPoint[];
};

export type ReadingGoalPlanResult =
	| ReadingGoalPlan
	| { kind: "unknown-length"; daysRead: number; isComplete: boolean };

/** Local midnight that starts the day `dayNumber`. */
function localMidnightOf(dayNumber: number): number {
	const utc = new Date(dayNumber * 86_400_000);
	return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate()).getTime();
}

/**
 * Sessions that count toward the plan: those ending after the goal began, so
 * reading earlier on the day a goal is created never becomes that goal's
 * progress, and on or after the day the plan starts. Sorted so a tie between
 * equal end times always resolves the same way.
 */
function planSessions(sessions: GoalSession[], goal: GoalParams, planStartDay: number) {
	const planStartMidnight = localMidnightOf(planStartDay);
	return sessions
		.filter((s) => s.endedAt >= goal.startedAt && s.endedAt >= planStartMidnight)
		.sort((a, b) => a.endedAt - b.endedAt);
}

/**
 * Reading position at local midnight starting `dayNumber`.
 *
 * The last session that ended before midnight gives its end position. A session
 * still running across midnight gives its start position instead: its end moves
 * with every checkpoint, and today's target must not. Rows written since
 * sittings split at midnight never do; older ones may.
 */
function makeStartOfDay(relevant: GoalSession[], goal: GoalParams, planStartDay: number) {
	const known = new Map<number, number>();
	return (dayNumber: number): number => {
		if (dayNumber <= planStartDay) return goal.planStartWord;
		const cached = known.get(dayNumber);
		if (cached !== undefined) return cached;
		const midnight = localMidnightOf(dayNumber);
		let position: number | null = null;
		let at = Number.NEGATIVE_INFINITY;
		for (const s of relevant) {
			if (s.endedAt < midnight) {
				if (s.endedAt >= at) {
					position = s.endWord;
					at = s.endedAt;
				}
			} else if (s.startedAt < midnight && s.startedAt >= Math.max(at, goal.startedAt)) {
				position = s.startWord;
				at = s.startedAt;
			}
		}
		const result = position ?? goal.planStartWord;
		known.set(dayNumber, result);
		return result;
	};
}

/**
 * Furthest word a day reached: the highest of its sessions' furthest read
 * words and where the day ended (today: the saved position). Moving back after
 * reading never undoes it, and a jump ahead counts only if the reader stays
 * there. Today the saved position also covers reading no session records,
 * such as on a paired device; a past day only has sessions to go by, so such
 * reading is lost for it. Rows from before the furthest word was recorded
 * fall back to their end.
 */
function makeFurthestOn(relevant: GoalSession[]) {
	const furthestByDay = new Map<number, number>();
	for (const s of relevant) {
		if (s.wordsRead <= 0) continue;
		const day = requireDayNumber(localDateKey(s.endedAt));
		const word = s.furthestWord ?? s.endWord;
		furthestByDay.set(day, Math.max(furthestByDay.get(day) ?? word, word));
	}
	return (dayNumber: number, dayStart: number, dayEnd: number): number =>
		Math.max(dayStart, dayEnd, furthestByDay.get(dayNumber) ?? dayStart);
}

/** A day's target is met once its reading got far enough, or finished the book that day. */
export function isDayMet(
	dayStart: number,
	furthest: number,
	targetWords: number,
	wordCount: number,
): boolean {
	const finishedThatDay =
		isFinishedPosition(furthest, wordCount) && !isFinishedPosition(dayStart, wordCount);
	return finishedThatDay || (targetWords > 0 && furthest - dayStart >= targetWords);
}

function dayTargetWords(
	goal: GoalParams,
	targetDay: number,
	dayNumber: number,
	dayStart: number,
	wordCount: number,
): number {
	const remaining = Math.max(0, wordCount - dayStart);
	if (remaining === 0) return 0;
	if (goal.mode === "pace")
		return Math.min(remaining, goalDailyWords(goal.dailyPercent, wordCount));
	const daysLeft = targetDay - dayNumber + 1;
	return daysLeft <= 1 ? remaining : Math.ceil(remaining / daysLeft);
}

export function planReadingGoal(input: GoalPlanInput): ReadingGoalPlanResult {
	const { goal, book, now } = input;
	const wordCount = book.wordCount;
	const position = book.wordPosition;
	const reachedEnd = isFinishedPosition(position, wordCount);
	const isComplete = goal.status === "completed" || reachedEnd;

	const startedDay = requireDayNumber(localDateKey(goal.startedAt));
	const readDays = new Set<string>();
	for (const s of input.sessions) {
		if (s.endedAt >= goal.startedAt && s.wordsRead > 0) readDays.add(localDateKey(s.endedAt));
	}
	const daysRead = readDays.size;

	if (wordCount <= 0) return { kind: "unknown-length", daysRead, isComplete };

	const planStartDay = requireDayNumber(goal.planStartDate);
	// A clock set back past the plan start would otherwise evaluate a day before the plan exists.
	const today = Math.max(requireDayNumber(localDateKey(now)), planStartDay, startedDay);
	const relevant = planSessions(input.sessions, goal, planStartDay);
	const startOfDay = makeStartOfDay(relevant, goal, planStartDay);
	const furthestOn = makeFurthestOn(relevant);
	const pace = readingPace(input.bookWpm ?? input.globalWpm);
	const dailyWords = goalDailyWords(goal.dailyPercent, wordCount);

	const line = goalPlanLine(goal, wordCount);
	const targetDay = line.targetDay;

	const amount = (words: number): GoalAmount => ({
		words,
		percent: (words / wordCount) * 100,
		minutes: words / pace.wpm,
	});

	const dayStartWord = startOfDay(today);
	const targetWords = dayTargetWords(goal, targetDay, today, dayStartWord, wordCount);
	const furthestTodayWord = furthestOn(today, dayStartWord, position);
	const progressWords = furthestTodayWord - dayStartWord;
	// The book counts as finished below 100%, so finishing meets any remaining target.
	const isTodayMet =
		reachedEnd || isDayMet(dayStartWord, furthestTodayWord, targetWords, wordCount);

	let daysTargetMet = goal.carriedDaysMet;
	const actualSeries: GoalSeriesPoint[] = [
		{ date: dayKeyOf(planStartDay - 1), percent: (goal.planStartWord / wordCount) * 100 },
	];
	for (let day = planStartDay; day <= today; day++) {
		const start = day === today ? dayStartWord : startOfDay(day);
		const end = day === today ? position : startOfDay(day + 1);
		const target = dayTargetWords(goal, targetDay, day, start, wordCount);
		// A book already finished at the day's start has nothing left to meet.
		const met =
			day === today
				? isTodayMet && !isFinishedPosition(start, wordCount)
				: isDayMet(start, furthestOn(day, start, end), target, wordCount);
		if (met) daysTargetMet++;
		actualSeries.push({ date: dayKeyOf(day), percent: (end / wordCount) * 100 });
	}

	let projectedFinishDay: number;
	if (isComplete) {
		projectedFinishDay =
			goal.completedAt != null ? requireDayNumber(localDateKey(goal.completedAt)) : today;
	} else if (goal.mode === "deadline") {
		projectedFinishDay = Math.max(targetDay, today);
	} else if (isTodayMet) {
		projectedFinishDay =
			position < wordCount ? paceFinishDay(today + 1, position, dailyWords, wordCount) : today;
	} else {
		projectedFinishDay = paceFinishDay(today, dayStartWord, dailyWords, wordCount);
	}

	const historySeries = buildHistory(
		input.sessions,
		goal,
		planStartDay,
		wordCount,
		Math.max(targetDay, today) - planStartDay + 1,
	);

	const planEndDay = Math.max(targetDay, planStartDay);
	const planSeries: GoalSeriesPoint[] = [];
	for (let day = planStartDay - 1; day <= planEndDay; day++) {
		planSeries.push({ date: dayKeyOf(day), percent: (line.at(day) / wordCount) * 100 });
	}

	return {
		kind: "plan",
		mode: goal.mode,
		today: dayKeyOf(today),
		targetDate: goal.mode === "deadline" ? goal.targetDate : dayKeyOf(targetDay),
		projectedFinishDate: dayKeyOf(projectedFinishDay),
		daysLeft: isComplete ? 0 : Math.max(0, projectedFinishDay - today + 1),
		isComplete,
		percentRead: (Math.min(position, wordCount) / wordCount) * 100,
		dailyTarget: amount(targetWords),
		dayStartWord,
		furthestTodayWord,
		progressToday: amount(progressWords),
		isTodayMet,
		aheadBehind: goalAheadBehind(line, position, today, wordCount),
		daysTargetMet,
		daysRead,
		pace,
		planSeries,
		actualSeries,
		historySeries,
	};
}

/**
 * Last position of each local day before the plan starts, carried across days
 * without reading, joined to the plan's starting position. Trimmed to
 * `maxDays`, the plan's own span, so a long history does not squash the chart.
 */
function buildHistory(
	sessions: GoalSession[],
	goal: GoalParams,
	planStartDay: number,
	wordCount: number,
	maxDays: number,
): GoalSeriesPoint[] {
	const endByDay = new Map<number, { at: number; word: number }>();
	for (const s of sessions) {
		const day = requireDayNumber(localDateKey(s.endedAt));
		if (day >= planStartDay) continue;
		const known = endByDay.get(day);
		if (!known || s.endedAt >= known.at) endByDay.set(day, { at: s.endedAt, word: s.endWord });
	}
	if (endByDay.size === 0) return [];
	const lastDay = planStartDay - 1;
	const days = [...endByDay.keys()].sort((a, b) => a - b);
	const firstDay = Math.max(days[0] ?? lastDay, lastDay - maxDays);
	const points: GoalSeriesPoint[] = [];
	let word = 0;
	for (const day of days) if (day <= firstDay) word = endByDay.get(day)?.word ?? word;
	for (let day = firstDay; day < lastDay; day++) {
		word = endByDay.get(day)?.word ?? word;
		points.push({ date: dayKeyOf(day), percent: (word / wordCount) * 100 });
	}
	points.push({ date: dayKeyOf(lastDay), percent: (goal.planStartWord / wordCount) * 100 });
	return points;
}

function clampDailyPercent(percent: number): number {
	return Math.min(MAX_GOAL_DAILY_PERCENT, Math.max(MIN_GOAL_DAILY_PERCENT, percent));
}

export type GoalPlanFields = Pick<
	ReadingGoal,
	"mode" | "planStartDate" | "planStartWord" | "targetDate" | "dailyPercent" | "carriedDaysMet"
>;

export type NewGoalSpec =
	| { mode: "deadline"; targetDate: string }
	| { mode: "pace"; dailyPercent: number };

/**
 * Plan fields for a goal starting now at `startWord`. Both modes store both a
 * target date and a daily percent, so a later mode switch has a value to keep.
 */
export function newGoalPlanFields(
	spec: NewGoalSpec,
	startWord: number,
	wordCount: number,
	now: number,
): GoalPlanFields {
	const today = localDateKey(now);
	const remainingPercent = wordCount > 0 ? Math.max(0, 100 - (startWord / wordCount) * 100) : 100;
	if (spec.mode === "deadline") {
		const days = Math.max(1, inclusiveDays(today, spec.targetDate));
		return {
			mode: "deadline",
			planStartDate: today,
			planStartWord: wordPos(startWord),
			targetDate: spec.targetDate,
			dailyPercent: clampDailyPercent(remainingPercent / days),
			carriedDaysMet: 0,
		};
	}
	const dailyPercent = clampDailyPercent(spec.dailyPercent);
	const days = Math.max(1, Math.ceil(remainingPercent / dailyPercent));
	return {
		mode: "pace",
		planStartDate: today,
		planStartWord: wordPos(startWord),
		targetDate: addDays(today, days - 1),
		dailyPercent,
		carriedDaysMet: 0,
	};
}

export type GoalChange = { mode?: ReadingGoalMode; targetDate?: string; dailyPercent?: number };

/**
 * Restart the plan line from today's start-of-day position, keeping the goal's
 * history: days already met carry over, and today's reading still counts today.
 *
 * Switching deadline -> pace keeps today's daily target as the pace; pace ->
 * deadline keeps the projected finish as the target date. An explicit value in
 * `change` wins over either.
 */
export function replanGoal(input: GoalPlanInput, change: GoalChange): GoalPlanFields {
	const { goal } = input;
	const plan = planReadingGoal(input);
	const mode = change.mode ?? goal.mode;
	const today = localDateKey(input.now);

	if (plan.kind !== "plan") {
		return {
			mode,
			planStartDate: today,
			planStartWord: wordPos(input.book.wordPosition),
			targetDate: change.targetDate ?? goal.targetDate,
			dailyPercent: clampDailyPercent(change.dailyPercent ?? goal.dailyPercent),
			carriedDaysMet: goal.carriedDaysMet,
		};
	}

	// Today's result is re-evaluated under the new parameters, so only earlier days carry.
	const carriedDaysMet =
		plan.daysTargetMet - (plan.isTodayMet && plan.dailyTarget.words > 0 ? 1 : 0);

	let dailyPercent = change.dailyPercent ?? goal.dailyPercent;
	let targetDate = change.targetDate ?? goal.targetDate;
	if (goal.mode === "deadline" && mode === "pace" && change.dailyPercent === undefined) {
		dailyPercent = plan.dailyTarget.percent;
	}
	if (goal.mode === "pace" && mode === "deadline" && change.targetDate === undefined) {
		targetDate = plan.projectedFinishDate;
	}
	if (mode === "pace" && change.targetDate === undefined) {
		const remainingPercent = 100 - (plan.dayStartWord / input.book.wordCount) * 100;
		targetDate = addDays(
			plan.today,
			Math.max(1, Math.ceil(remainingPercent / clampDailyPercent(dailyPercent))) - 1,
		);
	}

	return {
		mode,
		planStartDate: plan.today,
		planStartWord: wordPos(plan.dayStartWord),
		targetDate,
		dailyPercent: clampDailyPercent(dailyPercent),
		carriedDaysMet,
	};
}
