import { Button } from "@lesefluss/ui/button";
import { cn } from "@lesefluss/ui/utils";
import { CheckCircle2, Target } from "lucide-react";
import { useState } from "react";
import { queryHooks } from "../../../services/db/hooks";
import type { Book } from "../../../services/db/schema";
import { formatDayKey, localDateKey } from "../../../utils/date-utils";
import { minutesLabel, percentLabel, readingPace } from "../../../utils/reading-time";
import { GoalChart } from "./goal-chart";
import {
	canHaveGoal,
	canStartGoal,
	daysMetWithToday,
	GOAL_TONE_CLASS,
	goalTone,
	liveToday,
	MISSED_DAY_LABEL,
	signed,
} from "./goal-model";
import { GoalSetupSheet } from "./goal-setup-sheet";
import { DayCount, GoalStat } from "./goal-stat";

/** The book page's goal card, or the entry point to set one. Not offered for serial chapters. */
export function GoalCard({ book }: { book: Book }) {
	const [isSheetOpen, setSheetOpen] = useState(false);
	const result = queryHooks.useReadingGoalPlan(canHaveGoal(book) ? book.id : null);
	const bookStats = queryHooks.useStatsBook(book.id);
	const globalSpeed = queryHooks.useStatsMeasuredSpeed();

	if (!canHaveGoal(book) || result.isPending) return null;

	const goal = result.data?.goal ?? null;
	const plan = result.data?.plan.kind === "plan" ? result.data.plan : null;
	const wpm =
		plan?.pace.wpm ?? readingPace(bookStats.data?.measuredWpm ?? globalSpeed.data?.wpm).wpm;

	if (!goal) {
		if (!canStartGoal(book)) return null;
		return (
			<>
				<section
					className="book-detail-card mt-4 flex items-center justify-between gap-3"
					data-testid="goal-entry"
				>
					<h2 className="book-detail-section-title">Goal</h2>
					<Button variant="outline" size="sm" onClick={() => setSheetOpen(true)}>
						<Target aria-hidden />
						Set goal
					</Button>
				</section>
				<GoalSetupSheet
					isOpen={isSheetOpen}
					onClose={() => setSheetOpen(false)}
					book={book}
					wpm={wpm}
					existing={null}
				/>
			</>
		);
	}

	const isComplete = goal.status === "completed" || plan?.isComplete === true;
	const title = plan
		? isComplete
			? `Goal · done ${formatDayKey(localDateKey(goal.completedAt ?? Date.now()))}`
			: `Goal · by ${formatDayKey(plan.projectedFinishDate)}`
		: "Goal";
	const tone = plan ? goalTone(plan) : "even";
	const today = plan ? liveToday(plan, book.wordPosition, book.wordCount) : null;
	const canEdit = !isComplete && plan !== null;

	return (
		<section
			className="book-detail-card mt-4 flex flex-col gap-3.5"
			data-testid="goal-card"
			data-met={today?.isMet ?? false}
		>
			<div className="flex items-center justify-between gap-3">
				<h2 className="book-detail-section-title">{title}</h2>
				{canEdit && (
					<Button variant="outline" size="sm" onClick={() => setSheetOpen(true)}>
						Edit
					</Button>
				)}
			</div>

			{plan && today && !isComplete && (
				<>
					<div className="flex items-end justify-between gap-4">
						<div>
							<div className="font-bold text-4xl tabular-nums leading-none tracking-tight">
								{percentLabel(today.progressPercent)}
								<span className="font-normal text-xl opacity-60">
									{" "}
									/ {percentLabel(plan.dailyTarget.percent)}%
								</span>
							</div>
							<div className="mt-1.5 text-[11px] uppercase tracking-wider opacity-60">
								today · {Math.round(today.progressWords / plan.pace.wpm)} of{" "}
								{minutesLabel(plan.dailyTarget.minutes)}
							</div>
						</div>
						<div className="text-right">
							<div
								className={cn(
									"font-semibold text-xl tabular-nums leading-none",
									GOAL_TONE_CLASS[tone],
								)}
							>
								{signed(plan.aheadBehind.percent, "%")}
							</div>
							<div className="mt-1.5 text-[11px] uppercase tracking-wider opacity-60">
								vs plan · {signed(plan.aheadBehind.days, " d")}
							</div>
						</div>
					</div>
					<div className="h-1.5 overflow-hidden rounded-full bg-current/10">
						<div
							className={cn(
								"h-full rounded-full",
								today.isMet ? "bg-[var(--goal-met)]" : "bg-foreground",
							)}
							style={{ width: `${today.fraction * 100}%` }}
						/>
					</div>
				</>
			)}

			{isComplete && (
				<div className="flex items-center gap-1.5 font-semibold text-[var(--goal-met)] text-xl leading-none">
					<CheckCircle2 className="size-5 shrink-0" aria-hidden />
					Done
				</div>
			)}

			{plan && (
				<div className="grid grid-cols-4 gap-2 border-current/10 border-t pt-3">
					<GoalStat value={formatDayKey(plan.projectedFinishDate)} label="finish" />
					<GoalStat value={<DayCount days={plan.daysLeft} />} label="left" />
					<GoalStat
						value={<DayCount days={today ? daysMetWithToday(plan, today) : plan.daysTargetMet} />}
						label="days met"
					/>
					<GoalStat value={<DayCount days={plan.daysRead} />} label="days read" />
				</div>
			)}

			{plan && plan.planSeries.length > 1 && (
				<GoalChart
					planSeries={plan.planSeries}
					actualSeries={plan.actualSeries}
					historySeries={plan.historySeries}
					ariaLabel={`Plan vs actual: ${percentLabel(plan.percentRead)}% read, ${signed(plan.aheadBehind.percent, "%")} vs plan`}
				/>
			)}

			{!isComplete && (
				<div className="text-muted-foreground text-xs">
					Missed day:{" "}
					<span className="font-semibold text-foreground">{MISSED_DAY_LABEL[goal.mode]}</span>
				</div>
			)}

			{canEdit && (
				<GoalSetupSheet
					isOpen={isSheetOpen}
					onClose={() => setSheetOpen(false)}
					book={book}
					wpm={wpm}
					existing={{ goal, plan }}
				/>
			)}
		</section>
	);
}
