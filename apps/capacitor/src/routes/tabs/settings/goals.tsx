import { Button } from "@lesefluss/ui/button";
import { createFileRoute } from "@tanstack/react-router";
import { Bell, BellOff, Target } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { SettingsSection } from "@/components/settings/settings-section";
import { useContinueReading } from "@/hooks/use-continue-reading";
import { canStartGoal, goalAmountLabel } from "@/pages/library/reading-goal/goal-model";
import { GoalEditSheet, GoalSheetFor } from "@/pages/library/reading-goal/goal-sheet-for";
import { queryHooks } from "@/services/db/hooks";
import type { ReadingGoal } from "@/services/db/schema";
import { areRemindersSupported } from "@/services/goal-reminders";
import type { ReadingGoalPlan } from "@/services/stats/reading-goal";
import { editableGoals } from "@/services/stats/today-goal-summary";

export const Route = createFileRoute("/tabs/settings/goals")({
	component: Goals,
});

function Goals() {
	const plans = queryHooks.useActiveGoalPlans();
	const continueReading = useContinueReading();
	const [isNewOpen, setNewOpen] = useState(false);
	const goals = editableGoals(plans.data ?? []);
	const book = continueReading?.book;
	const canSetNew =
		book !== undefined && canStartGoal(book) && !goals.some((g) => g.goal.bookId === book.id);

	return (
		<div className="bg-background">
			<PageHeader title="Goals" icon={Target} />
			<div className="mx-auto max-w-2xl px-4 pt-4 pb-10">
				<SettingsSection title="Reading goals">
					{plans.data && goals.length === 0 && (
						<p className="m-0 px-4 py-3 text-muted-foreground text-sm">No active goals.</p>
					)}
					{goals.map((entry) => (
						<GoalRow key={entry.goal.id} entry={entry} />
					))}
				</SettingsSection>
				{book && canSetNew && (
					<>
						<Button variant="outline" className="mt-4 w-full" onClick={() => setNewOpen(true)}>
							<Target aria-hidden />
							Set a goal for {book.title}
						</Button>
						<GoalSheetFor
							book={book}
							existing={null}
							isOpen={isNewOpen}
							onClose={() => setNewOpen(false)}
						/>
					</>
				)}
			</div>
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
				<div className="truncate text-foreground text-sm">{book?.title ?? ""}</div>
				<div className="text-muted-foreground text-xs tabular-nums">
					{goalAmountLabel(entry.goal, entry.plan)}
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
