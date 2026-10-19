import { Popover, PopoverContent, PopoverTrigger } from "@lesefluss/ui/popover";
import { cn } from "@lesefluss/ui/utils";
import type { ReadingGoalPlan } from "../../services/stats/reading-goal";
import { formatDayKey } from "../../utils/date-utils";
import { minutesLabel, percentLabel } from "../../utils/reading-time";
import {
	daysMetWithToday,
	GOAL_TONE_CLASS,
	goalTone,
	type LiveToday,
	signed,
} from "../library/reading-goal/goal-model";
import { DayCount, GoalStat } from "../library/reading-goal/goal-stat";

const RING_RADIUS = 7;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

type Props = {
	plan: ReadingGoalPlan;
	today: LiveToday;
	onOpenDetails: () => void;
};

export function GoalChip({ plan, today, onOpenDetails }: Props) {
	const label = today.isMet
		? `Today's target met: ${percentLabel(today.targetPercent)}%`
		: `Today's target: ${percentLabel(today.progressPercent)} of ${percentLabel(today.targetPercent)}%`;
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
					<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className="shrink-0">
						<circle
							cx="9"
							cy="9"
							r={RING_RADIUS}
							fill="none"
							className="reader-goal-ring-track"
							strokeWidth="2.5"
						/>
						<circle
							cx="9"
							cy="9"
							r={RING_RADIUS}
							fill="none"
							className="reader-goal-ring"
							strokeWidth="2.5"
							strokeLinecap="round"
							strokeDasharray={`${today.fraction * RING_LENGTH} ${RING_LENGTH}`}
							transform="rotate(-90 9 9)"
						/>
					</svg>
					<span className="font-semibold">
						{percentLabel(today.isMet ? today.targetPercent : today.progressPercent)}
					</span>
					<span className="text-muted-foreground">/ {percentLabel(today.targetPercent)}%</span>
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
