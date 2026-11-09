import { cn } from "@lesefluss/ui/utils";
import { BookOpen, Check, Clock, Gauge, Hourglass, Target, Type, Zap } from "lucide-react";
import type { ReactNode } from "react";
import { goalTone } from "../../pages/library/reading-goal/goal-model";
import type { ReadingGoalPlan } from "../../services/stats/reading-goal";
import type { SummaryStats } from "../../services/stats/session-summary";
import { formatDayKey, formatDuration } from "../../utils/date-utils";
import { estimatePages, percentLabel } from "../../utils/reading-time";
import { GoalRing } from "../goal-ring";
import { Sparkline } from "../sparkline";

function Tile({
	icon,
	label,
	children,
	className,
	testId,
	onClick,
}: {
	icon: ReactNode;
	label: string;
	children: ReactNode;
	className?: string;
	testId?: string;
	onClick?: () => void;
}) {
	const body = (
		<>
			<span className="flex items-center gap-1.5 font-medium text-[0.625rem] text-muted-foreground uppercase tracking-wider">
				{icon}
				{label}
			</span>
			{children}
		</>
	);
	const tileClass = cn(
		"flex flex-col gap-1 rounded-xl border border-border bg-muted/40 p-3",
		className,
	);
	return onClick ? (
		<button
			type="button"
			onClick={onClick}
			className={cn(tileClass, "text-left hover:bg-muted")}
			data-testid={testId}
		>
			{body}
		</button>
	) : (
		<div className={tileClass} data-testid={testId}>
			{body}
		</div>
	);
}

const Value = ({ children }: { children: ReactNode }) => (
	<span className="font-semibold text-xl tabular-nums leading-tight">{children}</span>
);

const Caption = ({ children }: { children: ReactNode }) => (
	<span className="text-[0.6875rem] text-muted-foreground tabular-nums">{children}</span>
);

export function TimeTile({ activeMs, todayMinutes }: { activeMs: number; todayMinutes: number }) {
	return (
		<Tile icon={<Clock className="size-3" />} label="Time" testId="summary-time">
			<Value>{Math.max(1, Math.floor(activeMs / 60_000))} min</Value>
			<Caption>Today {todayMinutes} min</Caption>
		</Tile>
	);
}

/** "Today 15 / 11 min" for a minute goal, "3.3% / 3.3% today · on track 12 Dec" for a percent goal. */
export function summaryGoalLine(plan: ReadingGoalPlan): string {
	if (plan.dailyMinutes !== null) {
		return `Today ${Math.floor(plan.progressToday.minutes)} / ${plan.dailyMinutes} min`;
	}
	const pace = goalTone(plan) === "behind" ? "behind, finish" : "on track";
	return `${percentLabel(plan.progressToday.percent)}% / ${percentLabel(plan.dailyTarget.percent)}% today · ${pace} ${formatDayKey(plan.projectedFinishDate)}`;
}

export function GoalRow({ plan }: { plan: ReadingGoalPlan }) {
	return (
		<div
			className="col-span-2 flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm tabular-nums"
			data-testid="summary-goal"
			data-met={plan.isTodayMet}
		>
			<Target className="size-4 shrink-0 text-muted-foreground" aria-hidden />
			<span className="min-w-0 flex-1 truncate">{summaryGoalLine(plan)}</span>
			{plan.isTodayMet && (
				<span className="flex shrink-0 items-center gap-1 font-medium text-[var(--goal-met)] text-xs">
					<Check className="size-3.5" aria-hidden />
					Met
				</span>
			)}
		</div>
	);
}

export function WordsTile({ words }: { words: number }) {
	const pages = estimatePages(words);
	return (
		<Tile icon={<Type className="size-3" />} label="Words" testId="summary-words">
			<Value>{words.toLocaleString()}</Value>
			<Caption>
				{pages} {pages === 1 ? "page" : "pages"}
			</Caption>
		</Tile>
	);
}

export function SpeedTile({
	stats,
	trend,
	onOpen,
}: {
	stats: SummaryStats;
	trend: number[];
	onOpen: () => void;
}) {
	const delta = stats.deltaWpm;
	return (
		<Tile
			onClick={onOpen}
			icon={stats.isRsvp ? <Zap className="size-3" /> : <Gauge className="size-3" />}
			label={stats.isRsvp ? "RSVP speed" : "Speed"}
			testId="summary-speed"
		>
			<span className="flex items-baseline gap-1.5">
				<Value>{stats.wpm ?? "–"}</Value>
				<span className="text-[0.6875rem] text-muted-foreground">wpm</span>
				{delta !== null && (
					<span
						className={cn(
							"ml-auto rounded-full px-1.5 text-[0.625rem] tabular-nums",
							delta >= 0 ? "bg-emerald-500/15 text-emerald-700" : "bg-muted text-muted-foreground",
						)}
						data-testid="summary-speed-delta"
					>
						{delta > 0 ? "↑" : delta < 0 ? "↓" : "±"}
						{Math.abs(delta)} {stats.isRsvp ? "vs RSVP avg" : "vs avg"}
					</span>
				)}
			</span>
			<Sparkline points={trend} />
		</Tile>
	);
}

export function BookTile({ from, to }: { from: number; to: number }) {
	const gained = Math.max(0, Math.round(to) - Math.round(from));
	return (
		<Tile icon={<BookOpen className="size-3" />} label="Book" testId="summary-book">
			<span className="flex items-center gap-2">
				<GoalRing size={30} fraction={to / 100} />
				<Value>+{gained}%</Value>
			</span>
			<Caption>
				{Math.round(from)} → {Math.round(to)}%
			</Caption>
		</Tile>
	);
}

export function TimeSavedTile({ rsvp }: { rsvp: NonNullable<SummaryStats["rsvp"]> }) {
	const bars = [
		{ label: "RSVP", ms: rsvp.rsvpMs, className: "bg-primary" },
		{ label: `Reading (${rsvp.baselineWpm} wpm)`, ms: rsvp.baselineMs, className: "bg-primary/40" },
	];
	return (
		<Tile
			icon={<Hourglass className="size-3" />}
			label="Time saved"
			className="col-span-2"
			testId="summary-time-saved"
		>
			<Value>{formatDuration(rsvp.savedMs)}</Value>
			<div className="flex flex-col gap-1">
				{bars.map((bar) => (
					<div
						key={bar.label}
						className="flex items-center gap-2 text-[0.6875rem] text-muted-foreground"
					>
						<span className="w-28 truncate">{bar.label}</span>
						<span className="h-1.5 flex-1 rounded-full bg-current/10">
							<span
								className={cn("block h-full rounded-full", bar.className)}
								style={{ width: `${(bar.ms / rsvp.baselineMs) * 100}%` }}
							/>
						</span>
						<span className="w-10 text-right tabular-nums">{formatDuration(bar.ms)}</span>
					</div>
				))}
			</div>
		</Tile>
	);
}
