import { Popover, PopoverContent, PopoverTrigger } from "@lesefluss/ui/popover";
import { cn } from "@lesefluss/ui/utils";
import type { ReadingGoalPlan } from "../../services/stats/reading-goal";
import { formatDayKey } from "../../utils/date-utils";
import { minutesLabel } from "../../utils/reading-time";
import {
	daysMetWithToday,
	GOAL_TONE_CLASS,
	goalTone,
	type LiveToday,
	signed,
	todayFigure,
} from "../library/reading-goal/goal-model";
import { DayCount, GoalStat } from "../library/reading-goal/goal-stat";

type Props = {
	plan: ReadingGoalPlan;
	today: LiveToday;
	onOpenDetails: () => void;
};

export function GoalChip({ plan, today, onOpenDetails }: Props) {
	const figure = todayFigure(today);
	const label = today.isMet
		? `Today's target met: ${figure.target}`
		: `Today's target: ${figure.done} of ${figure.target}`;
	const daysMet = daysMetWithToday(plan, today);
	return (
		<Popover>
			<PopoverTrigger asChild>
				<button
					type="button"
					aria-label={label}
					data-testid="goal-chip"
					data-met={today.isMet}
					// The footer bar scrubs on pointerdown; a tap here opens the goal instead.
					onPointerDown={(e) => e.stopPropagation()}
					className={cn(
						"relative inline-flex shrink-0 items-center tabular-nums underline-offset-4 before:absolute before:-inset-x-1 before:-inset-y-3 before:content-[''] hover:underline",
						today.isMet && "text-[var(--goal-met)]",
					)}
				>
					Today {figure.done} of {figure.target}
				</button>
			</PopoverTrigger>
			<PopoverContent align="end" className="flex w-64 flex-col gap-3">
				<div className="flex items-center justify-between">
					<span className="font-semibold text-[0.6875rem] text-muted-foreground uppercase tracking-wider">
						Goal · by {formatDayKey(plan.projectedFinishDate)}
					</span>
					<button
						type="button"
						onClick={onOpenDetails}
						className="text-primary text-xs underline-offset-4 hover:underline"
					>
						Details
					</button>
				</div>
				<div className="h-1.5 overflow-hidden rounded-full bg-current/10">
					<div
						className={cn(
							"h-full rounded-full",
							today.isMet ? "bg-[var(--goal-met)]" : "bg-[var(--goal-progress)]",
						)}
						style={{ width: `${today.fraction * 100}%` }}
					/>
				</div>
				<div className="grid grid-cols-3 gap-2">
					<GoalStat
						size="sm"
						value={today.isMet ? "0 min" : minutesLabel(today.minutesToGo)}
						label="to go"
					/>
					<GoalStat
						size="sm"
						value={signed(plan.aheadBehind.percent, "%")}
						label="vs plan"
						className={GOAL_TONE_CLASS[goalTone(plan)]}
					/>
					<GoalStat size="sm" value={<DayCount days={daysMet} />} label="days met" />
				</div>
			</PopoverContent>
		</Popover>
	);
}
