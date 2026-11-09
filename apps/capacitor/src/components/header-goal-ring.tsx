import { Link } from "@tanstack/react-router";
import { queryHooks } from "../services/db/hooks";
import {
	formatGoalProgress,
	goalProgressMinutes,
	summarizeTodayGoals,
} from "../services/stats/today-goal-summary";
import { GoalRing } from "./goal-ring";

/** Today's goal ring for the library header: a full track with the minutes read inside, so it reads as a gauge and never as a spinner. */
export function HeaderGoalRing() {
	const plans = queryHooks.useActiveGoalPlans();
	if (!plans.data) return <span aria-hidden="true" className="size-11 shrink-0" />;
	const summary = summarizeTodayGoals(plans.data);
	if (summary.kind !== "goals") return null;
	return (
		// Not a Button: its icon rule shrinks every unsized svg to 16px.
		<Link
			to="/tabs/stats"
			aria-label={`Today's goal, ${formatGoalProgress(summary)}`}
			data-testid="header-goal-ring"
			className="inline-flex size-11 shrink-0 items-center justify-center rounded-full outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
		>
			<GoalRing
				size={36}
				fraction={summary.fraction}
				isMet={summary.isMet}
				trackClassName="stroke-muted-foreground/35"
			>
				<span
					className="font-bold text-[0.8125rem] text-foreground"
					data-testid="header-goal-minutes"
				>
					{goalProgressMinutes(summary).read}
				</span>
			</GoalRing>
		</Link>
	);
}
