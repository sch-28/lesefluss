import { Button } from "@lesefluss/ui/button";
import { Link } from "@tanstack/react-router";
import { queryHooks } from "../services/db/hooks";
import { summarizeTodayGoals, todayGoalLabel } from "../services/stats/today-goal-summary";
import { GoalRing } from "./goal-ring";

/** Today's goal ring for the phone's library header; the sidebar card covers wider screens. */
export function HeaderGoalRing() {
	const plans = queryHooks.useActiveGoalPlans();
	if (!plans.data) return null;
	const summary = summarizeTodayGoals(plans.data);
	if (summary.kind !== "goals") return null;
	return (
		<Button asChild variant="ghost" size="icon" className="md:hidden">
			<Link
				to="/tabs/stats"
				aria-label={`Today's goal, ${todayGoalLabel(summary)}`}
				data-testid="header-goal-ring"
			>
				<GoalRing size={22} fraction={summary.fraction} isMet={summary.isMet} />
			</Link>
		</Button>
	);
}
