import { Minus, Target } from "lucide-react";
import { useState } from "react";
import { useContinueReading } from "../../hooks/use-continue-reading";
import { canStartGoal } from "../../pages/library/reading-goal/goal-model";
import { GoalSheetFor } from "../../pages/library/reading-goal/goal-sheet-for";
import { queryHooks } from "../../services/db/hooks";
import { formatGoalProgress, summarizeTodayGoals } from "../../services/stats/today-goal-summary";
import { GoalRing } from "../goal-ring";

const RING_SIZE = 32;

function streakLabel(days: number): string {
	return days > 0 ? `${days}-day streak` : "No streak yet";
}

/**
 * Today's goals and the streak at the foot of the sidebar; a click continues the
 * book read last. The streak shows even with no book to continue or to set a goal for.
 */
export function SidebarGoalCard({ isCollapsed }: { isCollapsed: boolean }) {
	const continueReading = useContinueReading();
	const plans = queryHooks.useActiveGoalPlans();
	const streak = queryHooks.useStatsStreak();
	const [isSetupOpen, setSetupOpen] = useState(false);

	if (!plans.data) return null;
	const book = continueReading?.book;
	const summary = summarizeTodayGoals(plans.data);
	const streakText = streakLabel(streak.data?.current ?? 0);

	if (summary.kind === "goals") {
		return (
			<CardButton
				isCollapsed={isCollapsed}
				title={book ? `Continue ${book.title}` : "Today's reading goals"}
				onClick={continueReading?.open}
				ring={<GoalRing size={RING_SIZE} fraction={summary.fraction} isMet={summary.isMet} />}
				primary={formatGoalProgress(summary)}
				secondary={streakText}
				testId="sidebar-goal-card"
			/>
		);
	}

	const emptyRing = (
		<GoalRing size={RING_SIZE} fraction={0}>
			<Minus className="size-3 text-muted-foreground" />
		</GoalRing>
	);

	if (book && canStartGoal(book)) {
		return (
			<>
				<CardButton
					isCollapsed={isCollapsed}
					title={`Set a reading goal for ${book.title}`}
					onClick={() => setSetupOpen(true)}
					ring={
						<GoalRing size={RING_SIZE} fraction={0}>
							<Target className="size-3.5 text-muted-foreground" />
						</GoalRing>
					}
					primary="Set a goal"
					secondary={`for ${book.title}`}
					testId="sidebar-goal-card-empty"
				/>
				<GoalSheetFor
					book={book}
					existing={null}
					isOpen={isSetupOpen}
					onClose={() => setSetupOpen(false)}
				/>
			</>
		);
	}

	return (
		<CardButton
			isCollapsed={isCollapsed}
			title={book ? `Continue ${book.title}` : streakText}
			onClick={continueReading?.open}
			ring={emptyRing}
			primary={streakText}
			testId="sidebar-goal-card-streak"
		/>
	);
}

function CardButton({
	isCollapsed,
	title,
	onClick,
	ring,
	primary,
	secondary,
	testId,
}: {
	isCollapsed: boolean;
	title: string;
	/** Without one the card is a plain status, not a button. */
	onClick?: () => void;
	ring: React.ReactNode;
	primary: string;
	secondary?: string;
	testId: string;
}) {
	const label = isCollapsed && title !== primary ? `${title}: ${primary}` : title;
	const content = (
		<>
			<span className="flex w-16 shrink-0 items-center justify-center">{ring}</span>
			{!isCollapsed && (
				<span className="flex min-w-0 flex-col pr-3">
					<span className="truncate font-semibold text-sm tabular-nums">{primary}</span>
					{secondary && (
						<span className="truncate text-sidebar-foreground/60 text-xs">{secondary}</span>
					)}
				</span>
			)}
		</>
	);
	const className = "mt-2 flex w-full shrink-0 items-center py-2 text-left text-sidebar-foreground";
	if (!onClick) {
		return (
			<div title={title} data-testid={testId} className={className}>
				{content}
				{isCollapsed && <span className="sr-only">{label}</span>}
			</div>
		);
	}
	return (
		<button
			type="button"
			title={title}
			aria-label={label}
			onClick={onClick}
			data-testid={testId}
			className={`${className} hover:bg-sidebar-accent`}
		>
			{content}
		</button>
	);
}
