import { Button } from "@lesefluss/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@lesefluss/ui/drawer";
import { createFileRoute } from "@tanstack/react-router";
import { Bell, BellOff, Plus, Target } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { ReservedCard } from "@/components/reserved-card";
import { SettingsSection } from "@/components/settings/settings-section";
import { goalAmountLabel, goalCandidates } from "@/pages/library/reading-goal/goal-model";
import { GoalEditSheet, GoalSheetFor } from "@/pages/library/reading-goal/goal-sheet-for";
import { queryHooks } from "@/services/db/hooks";
import type { Book, ReadingGoal } from "@/services/db/schema";
import { areRemindersSupported } from "@/services/goal-reminders";
import type { ReadingGoalPlan } from "@/services/stats/reading-goal";
import { editableGoals, formatGoalProgress } from "@/services/stats/today-goal-summary";

export const Route = createFileRoute("/tabs/settings/goals")({
	component: Goals,
});

/** Must match the "No active goals." row. */
const NO_GOALS_ROW_HEIGHT = "calc(1.5rem + 1.25rem)";

function Goals() {
	const plans = queryHooks.useActiveGoalPlans();
	const goals = editableGoals(plans.data ?? []);

	return (
		<div className="bg-background">
			<PageHeader title="Goals" icon={Target} />
			<div className="mx-auto max-w-2xl px-4 pt-4 pb-10">
				<SettingsSection title="Goals">
					{!plans.data && <ReservedCard isPending height={NO_GOALS_ROW_HEIGHT} />}
					{plans.data && goals.length === 0 && (
						<p className="m-0 px-4 py-3 text-muted-foreground text-sm">No active goals.</p>
					)}
					{goals.map((entry) => (
						<GoalRow key={entry.goal.id} entry={entry} />
					))}
				</SettingsSection>
				<AddGoal
					goalBookIds={plans.data?.map((p) => p.goal.bookId) ?? []}
					isDisabled={!plans.data}
				/>
			</div>
		</div>
	);
}

function AddGoal({ goalBookIds, isDisabled }: { goalBookIds: string[]; isDisabled: boolean }) {
	const { data: library } = queryHooks.useBooks();
	const [isPickerOpen, setPickerOpen] = useState(false);
	const [picked, setPicked] = useState<Book | null>(null);
	const candidates = goalCandidates(library?.books ?? [], goalBookIds);
	const isNoneLeft = !isDisabled && library !== undefined && candidates.length === 0;

	return (
		<div className="mt-3 px-4">
			<Button
				variant="outline"
				className="h-11 w-full"
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
					No unfinished book is left without a goal. Add a book to your library to set one more.
				</p>
			)}
			<Drawer open={isPickerOpen} onOpenChange={setPickerOpen}>
				<DrawerContent className="sm:mx-auto sm:max-w-lg">
					<DrawerHeader>
						<DrawerTitle>Set a goal for</DrawerTitle>
					</DrawerHeader>
					<div className="flex flex-col divide-y divide-border overflow-y-auto px-4 pb-4">
						{candidates.map((book) => (
							<button
								key={book.id}
								type="button"
								data-testid="goal-candidate"
								className="flex min-h-14 cursor-pointer flex-col justify-center py-2 text-left"
								onClick={() => {
									setPickerOpen(false);
									setPicked(book);
								}}
							>
								<span className="truncate text-foreground text-sm">{book.title}</span>
								{book.author && (
									<span className="truncate text-muted-foreground text-xs">{book.author}</span>
								)}
							</button>
						))}
					</div>
				</DrawerContent>
			</Drawer>
			{picked && (
				<GoalSheetFor book={picked} existing={null} isOpen onClose={() => setPicked(null)} />
			)}
		</div>
	);
}

function GoalRow({ entry }: { entry: { goal: ReadingGoal; plan: ReadingGoalPlan } }) {
	const [isOpen, setOpen] = useState(false);
	const { data: book } = queryHooks.useBook(entry.goal.bookId);
	const reminder = entry.goal.reminderTime;
	return (
		<div
			className="flex items-center gap-3 border-border border-b px-4 py-3 last:border-b-0"
			data-testid="goal-row"
		>
			<div className="min-w-0 flex-1">
				<div className="min-h-[1lh] truncate text-foreground text-sm">{book?.title}</div>
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
