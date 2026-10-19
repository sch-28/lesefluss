import { useCallback, useMemo, useRef, useState } from "react";
import { queryHooks } from "../../services/db/hooks";
import type { Book } from "../../services/db/schema";
import { localDateKey } from "../../utils/date-utils";
import { percentLabel } from "../../utils/reading-time";
import { canHaveGoal, liveToday } from "../library/reading-goal/goal-model";
import type { ReaderGoalDivider } from "./goal-divider";

type FurthestRead = { key: string; bySitting: Record<string, number> };

/** Highest reported word, or null when no sitting of `key` has read anything. */
export function furthestReadFor(read: FurthestRead, key: string): number | null {
	if (read.key !== key) return null;
	const words = Object.values(read.bySitting);
	return words.length > 0 ? Math.max(...words) : null;
}

/** Applies one sitting's report; a new book or day starts over. */
export function withFurthestRead(
	read: FurthestRead,
	key: string,
	sessionId: string,
	word: number | null,
): FurthestRead {
	const bySitting = read.key === key ? { ...read.bySitting } : {};
	if (word === null) delete bySitting[sessionId];
	else bySitting[sessionId] = word;
	return { key, bySitting };
}

/**
 * The reader's view of today's goal: the active plan, today's progress at the
 * live position and the divider closing today's target. `word` is the saved
 * reading position, not where a browse has scrolled to.
 *
 * `reportFurthestRead` takes the session tracker's furthest read word per
 * sitting. Until a sitting's row reaches the plan it is the only record that
 * today's target was read to, so moving back right after must not un-meet it;
 * a discarded sitting (browsing undone) takes its reading back with it.
 */
export function useReaderGoal(
	book: Book | undefined,
	word: number,
	findParagraphIndexForWord: (word: number) => number,
) {
	const result = queryHooks.useReadingGoalPlan(book && canHaveGoal(book) ? book.id : null);
	const goalPlan =
		result.data?.goal.status === "active" && result.data.plan.kind === "plan"
			? result.data.plan
			: null;
	const wordCount = book?.wordCount ?? 0;

	const bookIdRef = useRef(book?.id);
	bookIdRef.current = book?.id;
	const [read, setRead] = useState<FurthestRead>({ key: "", bySitting: {} });
	const reportFurthestRead = useCallback((sessionId: string, furthest: number | null) => {
		const key = `${bookIdRef.current}:${localDateKey(Date.now())}`;
		setRead((prev) => withFurthestRead(prev, key, sessionId, furthest));
	}, []);
	const furthestReadToday =
		goalPlan && book ? furthestReadFor(read, `${book.id}:${goalPlan.today}`) : null;

	const goalToday = useMemo(
		() => (goalPlan ? liveToday(goalPlan, word, wordCount, furthestReadToday) : null),
		[goalPlan, word, wordCount, furthestReadToday],
	);
	const isMet = goalToday?.isMet ?? false;
	const goalDivider = useMemo((): ReaderGoalDivider | undefined => {
		if (!goalPlan || goalPlan.isComplete || goalPlan.dailyTarget.words <= 0) return undefined;
		const lastTargetWord = goalPlan.dayStartWord + goalPlan.dailyTarget.words - 1;
		return {
			paragraphIndex: findParagraphIndexForWord(lastTargetWord),
			divider: { label: `${percentLabel(goalPlan.dailyTarget.percent)}%`, passed: isMet },
		};
	}, [goalPlan, isMet, findParagraphIndexForWord]);
	return { goalPlan, goalToday, goalDivider, furthestReadToday, reportFurthestRead };
}
