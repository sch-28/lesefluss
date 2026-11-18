import { Button } from "@lesefluss/ui/button";
import { cn } from "@lesefluss/ui/utils";
import { createFileRoute } from "@tanstack/react-router";
import { Bell, BellOff, Plus, Target } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { EMPTY_STATE_PAGE, EmptyState } from "@/components/empty-state";
import { LIST_ROW, LIST_ROW_LABEL } from "@/components/list-row";
import { PageBody } from "@/components/page-body";
import { ReservedCard } from "@/components/reserved-card";
import { SettingsSection } from "@/components/settings/settings-section";
import { GoalBookPicker } from "@/pages/library/reading-goal/goal-book-picker";
import { goalAmountLabel, goalCandidates } from "@/pages/library/reading-goal/goal-model";
import { GoalEditSheet } from "@/pages/library/reading-goal/goal-sheet-for";
import { queryHooks } from "@/services/db/hooks";
import type { ReadingGoal } from "@/services/db/schema";
import { areRemindersSupported } from "@/services/goal-reminders";
import type { ReadingGoalPlan } from "@/services/stats/reading-goal";
import { editableGoals, formatGoalProgress } from "@/services/stats/today-goal-summary";

export const Route = createFileRoute("/tabs/settings/goals")({
	component: Goals,
});

function Goals() {
	const plans = queryHooks.useActiveGoalPlans();
	const goals = editableGoals(plans.data ?? []);
	const addGoal = (
		<AddGoal goalBookIds={plans.data?.map((p) => p.goal.bookId) ?? []} isDisabled={!plans.data} />
	);

	return (
		<div className="bg-background">
			<PageHeader width="text" title="Goals" icon={Target} />
			<PageBody width="text">
				{!plans.data ? (
					// Either loaded state can follow, so the spinner holds the empty state's page height.
					<ReservedCard isPending height="12rem" className={EMPTY_STATE_PAGE} />
				) : goals.length === 0 ? (
					<EmptyState page icon={Target} title="No active goals" action={addGoal}>
						Set a daily reading target for a book you are reading.
					</EmptyState>
				) : (
					<>
						<SettingsSection>
							{goals.map((entry) => (
								<GoalRow key={entry.goal.id} entry={entry} />
							))}
						</SettingsSection>
						{addGoal}
					</>
				)}
			</PageBody>
		</div>
	);
}

function AddGoal({ goalBookIds, isDisabled }: { goalBookIds: string[]; isDisabled: boolean }) {
	const { data: library } = queryHooks.useBooks();
	const [isPickerOpen, setPickerOpen] = useState(false);
	const candidates = goalCandidates(library?.books ?? [], goalBookIds);
	const isNoneLeft = !isDisabled && library !== undefined && candidates.length === 0;

	return (
		<div className="mt-3 px-4">
			<Button
				variant="outline"
				className="w-full md:w-fit"
				disabled={isDisabled || isNoneLeft}
				onClick={() => setPickerOpen(true)}
				data-testid="add-goal"
			>
				<Plus aria-hidden />
				Add goal
			</Button>
			{isNoneLeft && (
				<p
					className="m-0 mt-2 text-center text-muted-foreground text-xs"
					data-testid="add-goal-none-left"
				>
					{library?.books.length === 0
						? "Goals are set per book. Add a book to your library to set one."
						: "No unfinished book is left without a goal. Add a book to your library to set one more."}
				</p>
			)}
			<GoalBookPicker
				isOpen={isPickerOpen}
				onClose={() => setPickerOpen(false)}
				goalBookIds={goalBookIds}
			/>
		</div>
	);
}

function GoalRow({ entry }: { entry: { goal: ReadingGoal; plan: ReadingGoalPlan } }) {
	const [isOpen, setOpen] = useState(false);
	const { data: book } = queryHooks.useBook(entry.goal.bookId);
	const reminder = entry.goal.reminderTime;
	return (
		<div className={cn(LIST_ROW, "border-border border-b last:border-b-0")} data-testid="goal-row">
			<div className="min-w-0 flex-1">
				<div className={cn("min-h-[1lh] truncate", LIST_ROW_LABEL)}>{book?.title}</div>
				<div className="text-muted-foreground text-xs tabular-nums">
					{goalAmountLabel(entry.goal, entry.plan)}
				</div>
				<div className="text-muted-foreground text-xs tabular-nums" data-testid="goal-row-today">
					Today {formatGoalProgress(todayProgress(entry.plan))}
				</div>
				{areRemindersSupported() && (
					<div className="mt-0.5 flex items-center gap-1 text-muted-foreground text-xs">
						{reminder ? (
							<Bell className="size-3" aria-hidden />
						) : (
							<BellOff className="size-3" aria-hidden />
						)}
						{reminder ? `Reminder at ${reminder}` : "No reminder"}
					</div>
				)}
			</div>
			<Button
				variant="outline"
				size="sm"
				onClick={() => setOpen(true)}
				aria-label={`Edit goal for ${book?.title ?? "book"}`}
			>
				Edit
			</Button>
			<GoalEditSheet existing={entry} isOpen={isOpen} onClose={() => setOpen(false)} />
		</div>
	);
}

function todayProgress(plan: ReadingGoalPlan) {
	return {
		minutesRead: plan.progressToday.minutes,
		minutesNeeded: plan.dailyMinutes ?? plan.dailyTarget.minutes,
		isMet: plan.isTodayMet,
	};
}
