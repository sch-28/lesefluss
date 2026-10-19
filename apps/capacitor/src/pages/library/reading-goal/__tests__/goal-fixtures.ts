import { wordPos } from "@lesefluss/core";
import type { ReadingGoal } from "../../../../services/db/schema";
import {
	type GoalSession,
	newGoalPlanFields,
	planReadingGoal,
	type ReadingGoalPlan,
} from "../../../../services/stats/reading-goal";

export const WORDS = 1000;
const CREATED = new Date(2026, 2, 1, 10).getTime();

export function at(day: number, hour = 12): number {
	return new Date(2026, 2, day, hour).getTime();
}

export function session(day: number, startWord: number, endWord: number): GoalSession {
	const endedAt = at(day, 20);
	return {
		startedAt: endedAt - 600_000,
		endedAt,
		startWord,
		endWord,
		wordsRead: endWord - startWord,
	};
}

/** A deadline goal over 1-10 March on a 1,000-word book, so each day asks for 100 words (10%). */
export function makeGoal(overrides: Partial<ReadingGoal> = {}): ReadingGoal {
	return {
		id: "g1",
		bookId: "deadbeef",
		status: "active",
		startedAt: CREATED,
		startWord: wordPos(0),
		...newGoalPlanFields({ mode: "deadline", targetDate: "2026-03-10" }, 0, WORDS, CREATED),
		completedAt: null,
		reminderTime: null,
		deleted: false,
		createdAt: CREATED,
		updatedAt: CREATED,
		...overrides,
	};
}

export function makePlan(input: {
	goal?: ReadingGoal;
	position: number;
	sessions?: GoalSession[];
	now?: number;
}): ReadingGoalPlan {
	const result = planReadingGoal({
		goal: input.goal ?? makeGoal(),
		book: { wordCount: WORDS, wordPosition: input.position },
		sessions: input.sessions ?? [],
		bookWpm: 200,
		globalWpm: null,
		now: input.now ?? at(1),
	});
	if (result.kind !== "plan") throw new Error("expected a plan");
	return result;
}
