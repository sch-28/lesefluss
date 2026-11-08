import { useNavigate } from "@tanstack/react-router";
import { Target } from "lucide-react";
import { useState } from "react";
import { GoalRing } from "../../../components/goal-ring";
import { useContinueReading } from "../../../hooks/use-continue-reading";
import { queryHooks } from "../../../services/db/hooks";
import {
	editableGoals,
	summarizeTodayGoals,
	todayGoalLabel,
} from "../../../services/stats/today-goal-summary";
import { canStartGoal } from "../reading-goal/goal-model";
import { GoalEditSheet, GoalSheetFor } from "../reading-goal/goal-sheet-for";

const RING_SIZE = 44;

/**
 * Today's goal ring and the streak at the top of Stats.
 * One goal opens its editor, several open the goals page, none offers a goal
 * for the book read last.
 */
export function TodayGoalCard({ streak }: { streak: number }) {
	const navigate = useNavigate();
	const plans = queryHooks.useActiveGoalPlans();
	const continueReading = useContinueReading();
	const [isSheetOpen, setSheetOpen] = useState(false);

	if (!plans.data) return null;
	const summary = summarizeTodayGoals(plans.data);
	const editable = editableGoals(plans.data);
	const streakText = streak > 0 ? `${streak}-day streak` : "No streak yet";
	const book = continueReading?.book;

	if (summary.kind === "goals") {
		const only = editable.length === 1 ? editable[0] : null;
		return (
			<>
				<CardButton
					label={only ? "Edit today's goal" : "Reading goals"}
					onClick={() => (only ? setSheetOpen(true) : navigate({ to: "/tabs/settings/goals" }))}
					ring={<GoalRing size={RING_SIZE} fraction={summary.fraction} isMet={summary.isMet} />}
					primary={`Today ${todayGoalLabel(summary)}`}
					secondary={streakText}
				/>
				{only && (
					<GoalEditSheet existing={only} isOpen={isSheetOpen} onClose={() => setSheetOpen(false)} />
				)}
			</>
		);
	}

	if (!book || !canStartGoal(book)) return null;
	return (
		<>
			<CardButton
				label={`Set a reading goal for ${book.title}`}
				onClick={() => setSheetOpen(true)}
				ring={
					<GoalRing size={RING_SIZE} fraction={0}>
						<Target className="size-4 text-muted-foreground" />
					</GoalRing>
				}
				primary="Set a daily goal"
				secondary={`for ${book.title}`}
			/>
			<GoalSheetFor
				book={book}
				existing={null}
				isOpen={isSheetOpen}
				onClose={() => setSheetOpen(false)}
			/>
		</>
	);
}

function CardButton({
	label,
	onClick,
	ring,
	primary,
	secondary,
}: {
	label: string;
	onClick: () => void;
	ring: React.ReactNode;
	primary: string;
	secondary: string;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			onClick={onClick}
			data-testid="stats-goal-card"
			className="mx-4 mt-3 flex w-[calc(100%-2rem)] items-center gap-4 rounded-2xl border border-current/10 bg-card p-4 text-left text-card-foreground hover:bg-muted"
		>
			{ring}
			<span className="flex min-w-0 flex-col">
				<span className="truncate font-semibold tabular-nums">{primary}</span>
				<span className="truncate text-muted-foreground text-sm">{secondary}</span>
			</span>
		</button>
	);
}
