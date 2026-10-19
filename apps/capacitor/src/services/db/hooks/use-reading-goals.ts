import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalDayNow } from "../../../hooks/use-local-day";
import { localDateKey } from "../../../utils/date-utils";
import { requestReminderSync } from "../../goal-reminders";
import type { GoalChange, NewGoalSpec } from "../../stats/reading-goal";
import { scheduleSyncPush } from "../../sync";
import { queries } from "../queries";
import type { Book } from "../schema";
import { statsKeys } from "./query-keys";

/** `null` for a book that cannot have a goal. Keyed by local day, so the plan rolls over at midnight. */
function useReadingGoalPlan(bookId: string | null) {
	const now = useLocalDayNow();
	return useQuery({
		queryKey: statsKeys.goalPlan(bookId ?? "", localDateKey(now)),
		queryFn: () => (bookId ? queries.getReadingGoalPlan(bookId, now) : null),
		enabled: bookId !== null,
	});
}

function useGoalMutation<T>(mutationFn: (vars: T) => Promise<unknown>) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn,
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: statsKeys.all });
			requestReminderSync();
			scheduleSyncPush();
		},
	});
}

function useCreateReadingGoal() {
	return useGoalMutation((vars: { book: Book; spec: NewGoalSpec; reminderTime: string | null }) =>
		queries.createGoal(vars.book, vars.spec, Date.now(), vars.reminderTime),
	);
}

function useSetGoalReminder() {
	return useGoalMutation((vars: { id: string; reminderTime: string | null }) =>
		queries.setGoalReminder(vars.id, vars.reminderTime),
	);
}

function useReplanReadingGoal() {
	return useGoalMutation((vars: { id: string; change: GoalChange }) =>
		queries.replanGoalById(vars.id, vars.change),
	);
}

function useDeleteReadingGoal() {
	return useGoalMutation(({ id }: { id: string }) => queries.deleteGoal(id));
}

export const readingGoalHooks = {
	useReadingGoalPlan,
	useCreateReadingGoal,
	useReplanReadingGoal,
	useSetGoalReminder,
	useDeleteReadingGoal,
};
