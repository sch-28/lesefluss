import { Popover, PopoverContent, PopoverTrigger } from "@lesefluss/ui/popover";
import { cn } from "@lesefluss/ui/utils";
import { GoalRing } from "../../components/goal-ring";
import type { ReadingGoalPlan } from "../../services/stats/reading-goal";
import { formatDayKey } from "../../utils/date-utils";
import { minutesLabel, percentLabel } from "../../utils/reading-time";
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
	const isMinutes = today.targetMinutes != null;
	const label = today.isMet
		? `Today's target met: ${figure.target}`
		: `Today's target: ${figure.done} of ${figure.target}`;
	// A met percent goal shows its target, so the chip reads "10.0 / 10.0%" rather than overshooting.
	const done = today.isMet && !isMinutes ? percentLabel(today.targetPercent) : figure.done;
	const daysMet = daysMetWithToday(plan, today);
	return (
		<Popover>
			<PopoverTrigger asChild>
				<button
					type="button"
					aria-label={label}
					data-testid="goal-chip"
					data-met={today.isMet}
					className={cn(
						// 32px tall on screen, 44px to a finger.
						"reader-goal-chip relative mr-0.5 inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border border-border bg-muted/40 pr-2.5 pl-1.5 text-xs tabular-nums before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-['']",
						today.isMet && "reader-goal-chip--met",
					)}
				>
					<GoalRing size={18} fraction={today.fraction} isMet={today.isMet} />
					<span className="font-semibold">{done}</span>
					<span className="text-muted-foreground">/ {figure.target}</span>
				</button>
			</PopoverTrigger>
			<PopoverContent align="end" className="flex w-64 flex-col gap-3">
				<div className="flex items-center justify-between">
					<span className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wider">
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
