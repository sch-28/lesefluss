import { IconButton } from "@lesefluss/ui/icon-button";
import { cn } from "@lesefluss/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { CalendarDays, ChevronUp, Target } from "lucide-react";
import { useState } from "react";
import { GoalRing } from "../../../components/goal-ring";
import { useBackHandler } from "../../../hooks/use-back-handler";
import { useContinueReading } from "../../../hooks/use-continue-reading";
import { queryHooks } from "../../../services/db/hooks";
import { shiftMonth } from "../../../services/stats/calendar";
import {
	editableGoals,
	formatGoalProgress,
	summarizeTodayGoals,
} from "../../../services/stats/today-goal-summary";
import { canStartGoal } from "../reading-goal/goal-model";
import { GoalEditSheet, GoalSheetFor } from "../reading-goal/goal-sheet-for";
import { MonthPager, StreakCalendar, StreakWeekStrip } from "./streak-calendar";

const RING_SIZE = 56;

type GoalTarget = "edit" | "goals" | "start";

/**
 * Today's goal and the streak in one card at the top of Stats.
 * One goal opens its editor, several open the goals page, none offers a goal
 * for the book read last, or the goals page when there is no such book.
 */
export function TodayGoalCard() {
	const navigate = useNavigate();
	const plans = queryHooks.useActiveGoalPlans();
	const streak = queryHooks.useStatsStreak();
	const continueReading = useContinueReading();
	const [isSheetOpen, setSheetOpen] = useState(false);

	const book = continueReading?.book;
	const startable = book && canStartGoal(book) ? book : null;
	const summary = plans.data ? summarizeTodayGoals(plans.data) : null;
	const editable = plans.data ? editableGoals(plans.data) : [];
	const only = editable.length === 1 ? editable[0] : null;

	const target: GoalTarget =
		summary?.kind === "goals" ? (only ? "edit" : "goals") : startable ? "start" : "goals";
	const label =
		target === "edit"
			? "Edit today's goal"
			: target === "start" && startable
				? `Set a reading goal for ${startable.title}`
				: "Reading goals";
	const primary =
		summary?.kind === "goals" ? `Today ${formatGoalProgress(summary)}` : "Set a daily goal";

	const isPending = !plans.data || streak.isPending;

	return (
		<section className="mt-3 px-4" data-testid="stats-goal-card">
			<div className="rounded-[14px] border border-border bg-card p-4 text-card-foreground">
				<StreakCalendarToggle>
					{(calendarButton) => (
						<div className="flex items-center gap-3">
							<button
								type="button"
								aria-label={label}
								disabled={isPending}
								onClick={() =>
									target === "goals" ? navigate({ to: "/tabs/settings/goals" }) : setSheetOpen(true)
								}
								className="-m-1 flex min-w-0 flex-1 items-center gap-3 rounded-[10px] p-1 text-left hover:bg-muted"
							>
								<GoalRing
									size={RING_SIZE}
									fraction={summary?.kind === "goals" ? summary.fraction : 0}
									isMet={summary?.kind === "goals" && summary.isMet}
								>
									{summary?.kind !== "goals" && !isPending && (
										<Target className="size-5 text-muted-foreground" />
									)}
								</GoalRing>
								<span className={cn("flex min-w-0 flex-col", isPending && "invisible")}>
									<span className="truncate font-semibold text-[1.0625rem] tabular-nums">
										{primary}
									</span>
									<span className="truncate text-[0.8125rem] text-muted-foreground">
										{streakLine(streak.data)}
									</span>
								</span>
							</button>
							{calendarButton}
						</div>
					)}
				</StreakCalendarToggle>
			</div>
			{target === "edit" && only && (
				<GoalEditSheet existing={only} isOpen={isSheetOpen} onClose={() => setSheetOpen(false)} />
			)}
			{target === "start" && startable && (
				<GoalSheetFor
					book={startable}
					existing={null}
					isOpen={isSheetOpen}
					onClose={() => setSheetOpen(false)}
				/>
			)}
		</section>
	);
}

export function streakLine(
	streak: { current: number; longest: number; freezesBanked: number } | undefined,
): string {
	if (!streak) return "";
	const parts = [
		streak.current > 0 ? `${streak.current}-day streak` : "No streak yet",
		`best ${streak.longest}`,
	];
	if (streak.freezesBanked > 0) {
		parts.push(`${streak.freezesBanked} ${streak.freezesBanked === 1 ? "freeze" : "freezes"}`);
	}
	return parts.join(" · ");
}

/** The week row, or the month grid with its pager while the calendar is open. */
function StreakCalendarToggle({
	children,
}: {
	children: (calendarButton: React.ReactNode) => React.ReactNode;
}) {
	const [isExpanded, setIsExpanded] = useState(false);
	const [monthAnchor, setMonthAnchor] = useState(() => shiftMonth(Date.now(), 0));
	useBackHandler(isExpanded, () => setIsExpanded(false));

	const calendarButton = isExpanded ? (
		<IconButton aria-label="Show current week" onClick={() => setIsExpanded(false)}>
			<ChevronUp />
		</IconButton>
	) : (
		<IconButton
			aria-label="Streak calendar"
			onClick={() => {
				setMonthAnchor(shiftMonth(Date.now(), 0));
				setIsExpanded(true);
			}}
		>
			<CalendarDays />
		</IconButton>
	);

	return (
		<>
			{children(calendarButton)}
			{isExpanded ? (
				<>
					<div className="mt-4 flex justify-center">
						<MonthPager
							monthAnchor={monthAnchor}
							onStep={(delta) => setMonthAnchor((month) => shiftMonth(month, delta))}
						/>
					</div>
					<StreakCalendar monthAnchor={monthAnchor} />
				</>
			) : (
				<StreakWeekStrip />
			)}
		</>
	);
}
