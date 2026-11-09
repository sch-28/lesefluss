import type { ReadingGoalPlan, ReadingGoalPlanResult } from "./reading-goal";

export type TodayGoalSummary =
	| { kind: "none" }
	| { kind: "goals"; minutesRead: number; minutesNeeded: number; fraction: number; isMet: boolean };

/**
 * Today's minutes against what every active goal needs today. A goal counts at
 * most its own need, so a long sitting in one book does not fill another's.
 * Word goals count the minutes their daily words take at the reader's pace.
 */
export function summarizeTodayGoals(
	plans: readonly { plan: ReadingGoalPlanResult }[],
): TodayGoalSummary {
	let minutesRead = 0;
	let minutesNeeded = 0;
	let isMet = true;
	for (const { plan } of plans) {
		if (plan.kind !== "plan" || plan.isComplete) continue;
		const need = plan.dailyMinutes ?? plan.dailyTarget.minutes;
		if (need <= 0) continue;
		minutesNeeded += need;
		minutesRead += plan.isTodayMet ? need : Math.min(need, plan.progressToday.minutes);
		isMet &&= plan.isTodayMet;
	}
	if (minutesNeeded === 0) return { kind: "none" };
	return {
		kind: "goals",
		minutesRead,
		minutesNeeded,
		fraction: Math.min(1, minutesRead / minutesNeeded),
		isMet,
	};
}

type GoalProgress = { minutesRead: number; minutesNeeded: number; isMet: boolean };

/** Read rounds down and the need up, so a day only looks done once it is. */
export function goalProgressMinutes(progress: GoalProgress): { read: number; needed: number } {
	const needed = Math.ceil(progress.minutesNeeded);
	const read = progress.isMet ? needed : Math.min(needed, Math.floor(progress.minutesRead));
	return { read, needed };
}

/** "19 of 30 min": the one way every screen shows a goal's progress today. */
export function formatGoalProgress(progress: GoalProgress): string {
	const { read, needed } = goalProgressMinutes(progress);
	return `${read} of ${needed} min`;
}

/** The goals that can still be edited: a known length and not yet finished. */
export function editableGoals<G>(
	plans: readonly { goal: G; plan: ReadingGoalPlanResult }[],
): { goal: G; plan: ReadingGoalPlan }[] {
	return plans.flatMap(({ goal, plan }) =>
		plan.kind === "plan" && !plan.isComplete ? [{ goal, plan }] : [],
	);
}
