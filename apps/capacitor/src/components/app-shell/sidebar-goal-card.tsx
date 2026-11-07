import { bookPace } from "@lesefluss/core";
import { Minus } from "lucide-react";
import { useState } from "react";
import { useContinueReading } from "../../hooks/use-continue-reading";
import { canStartGoal } from "../../pages/library/reading-goal/goal-model";
import { GoalSetupSheet } from "../../pages/library/reading-goal/goal-setup-sheet";
import { queryHooks } from "../../services/db/hooks";
import type { Book } from "../../services/db/schema";
import { summarizeTodayGoals, todayGoalLabel } from "../../services/stats/today-goal-summary";
import { GoalRing } from "../goal-ring";

const RING_SIZE = 32;

function streakLabel(days: number): string {
	return days > 0 ? `${days}-day streak` : "No streak yet";
}

/** Today's goals at the foot of the sidebar; a click continues the book read last. */
export function SidebarGoalCard({ isCollapsed }: { isCollapsed: boolean }) {
	const continueReading = useContinueReading();
	const plans = queryHooks.useActiveGoalPlans();
	const streak = queryHooks.useStatsStreak();
	const [isSetupOpen, setSetupOpen] = useState(false);

	if (!continueReading || !plans.data) return null;
	const { book, open } = continueReading;
	const summary = summarizeTodayGoals(plans.data);
	const streakText = streakLabel(streak.data?.current ?? 0);

	if (summary.kind === "none") {
		if (!canStartGoal(book)) return null;
		const hint = `Set a reading goal for ${book.title}`;
		return (
			<>
				<CardButton
					isCollapsed={isCollapsed}
					title={hint}
					onClick={() => setSetupOpen(true)}
					ring={
						<GoalRing size={RING_SIZE} fraction={0}>
							<Minus className="size-3 text-muted-foreground" />
						</GoalRing>
					}
					primary="Set a goal"
					secondary={streakText}
					testId="sidebar-goal-card-empty"
				/>
				<GoalSetupFor book={book} isOpen={isSetupOpen} onClose={() => setSetupOpen(false)} />
			</>
		);
	}

	return (
		<CardButton
			isCollapsed={isCollapsed}
			title={`Continue ${book.title}`}
			onClick={open}
			ring={<GoalRing size={RING_SIZE} fraction={summary.fraction} isMet={summary.isMet} />}
			primary={todayGoalLabel(summary)}
			secondary={streakText}
			testId="sidebar-goal-card"
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
	onClick: () => void;
	ring: React.ReactNode;
	primary: string;
	secondary: string;
	testId: string;
}) {
	return (
		<button
			type="button"
			title={title}
			aria-label={isCollapsed ? `${title}: ${primary}` : title}
			onClick={onClick}
			data-testid={testId}
			className="mt-2 flex w-full shrink-0 items-center py-2 text-left text-sidebar-foreground hover:bg-sidebar-accent"
		>
			<span className="flex w-16 shrink-0 items-center justify-center">{ring}</span>
			{!isCollapsed && (
				<span className="flex min-w-0 flex-col pr-3">
					<span className="truncate font-semibold text-sm tabular-nums">{primary}</span>
					<span className="truncate text-sidebar-foreground/60 text-xs">{secondary}</span>
				</span>
			)}
		</button>
	);
}

function GoalSetupFor({
	book,
	isOpen,
	onClose,
}: {
	book: Book;
	isOpen: boolean;
	onClose: () => void;
}) {
	const speedModel = queryHooks.useStatsSpeedModel();
	return (
		<GoalSetupSheet
			isOpen={isOpen}
			onClose={onClose}
			book={book}
			wpm={bookPace(speedModel.data, book.id).wpm}
			existing={null}
		/>
	);
}
