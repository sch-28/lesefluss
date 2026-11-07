import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalDayNow } from "../../../hooks/use-local-day";
import { localDateKey } from "../../../utils/date-utils";
import { requestReminderSync } from "../../goal-reminders";
import { type GoalChange, minuteGoalOf, type NewGoalSpec } from "../../stats/reading-goal";
import { scheduleSyncPush } from "../../sync";
import { queries } from "../queries";
import type { Book } from "../schema";
import { statsKeys } from "./query-keys";
import { settingsHooks } from "./use-settings";

// Plans are paced from the speed model, so a new window must replan them.
function useSpeedWindowKey() {
	const settings = settingsHooks.useSettings();
	return { window: settings.data?.speedWindow ?? "", ready: settings.data !== undefined };
}

// The reading tracker's heartbeat writes the open sitting this often.
const SITTING_CHECKPOINT_MS = 30_000;

/**
 * `null` for a book that cannot have a goal. Keyed by local day, so the plan rolls over at midnight.
 * `live` re-reads a minute goal while the reader is open: its minutes come from saved sittings,
 * which only checkpoints update until the sitting ends.
 */
function useReadingGoalPlan(bookId: string | null, { live = false }: { live?: boolean } = {}) {
	const now = useLocalDayNow();
	const speed = useSpeedWindowKey();
	return useQuery({
		queryKey: statsKeys.goalPlan(bookId ?? "", localDateKey(now), speed.window),
		queryFn: () => (bookId ? queries.getReadingGoalPlan(bookId, now) : null),
		enabled: bookId !== null && speed.ready,
		refetchInterval: (query) =>
			live && query.state.data && minuteGoalOf(query.state.data.goal) !== null
				? SITTING_CHECKPOINT_MS
				: false,
	});
}

/** Today's plan of every active goal; refreshed like a live plan, since an open sitting adds minutes. */
function useActiveGoalPlans() {
	const now = useLocalDayNow();
	const speed = useSpeedWindowKey();
	return useQuery({
		queryKey: statsKeys.activeGoalPlans(localDateKey(now), speed.window),
		queryFn: () => queries.getActiveGoalPlans(now),
		enabled: speed.ready,
		refetchInterval: SITTING_CHECKPOINT_MS,
	});
}

function useLastReadBookId() {
	return useQuery({
		queryKey: statsKeys.lastReadBook,
		queryFn: () => queries.getLastReadBookId(),
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
	useActiveGoalPlans,
	useLastReadBookId,
	useCreateReadingGoal,
	useReplanReadingGoal,
	useSetGoalReminder,
	useDeleteReadingGoal,
};
