import { cn } from "@lesefluss/ui/utils";
import { BookOpen, Clock, Gauge, Hourglass, Type, Zap } from "lucide-react";
import type { ReactNode } from "react";
import type { SummaryStats } from "../../services/stats/session-summary";
import { formatDuration } from "../../utils/date-utils";
import { estimatePages } from "../../utils/reading-time";
import { GoalRing } from "../goal-ring";

function Tile({
	icon,
	label,
	children,
	className,
	testId,
}: {
	icon: ReactNode;
	label: string;
	children: ReactNode;
	className?: string;
	testId?: string;
}) {
	return (
		<div
			className={cn(
				"flex flex-col gap-1 rounded-xl border border-border bg-muted/40 p-3",
				className,
			)}
			data-testid={testId}
		>
			<span className="flex items-center gap-1.5 font-medium text-[10px] text-muted-foreground uppercase tracking-wider">
				{icon}
				{label}
			</span>
			{children}
		</div>
	);
}

const Value = ({ children }: { children: ReactNode }) => (
	<span className="font-semibold text-xl tabular-nums leading-tight">{children}</span>
);

const Caption = ({ children }: { children: ReactNode }) => (
	<span className="text-[11px] text-muted-foreground tabular-nums">{children}</span>
);

export function TimeTile({
	activeMs,
	earlierMinutes,
	todayMinutes,
	goalMinutes,
}: {
	activeMs: number;
	earlierMinutes: number;
	todayMinutes: number;
	goalMinutes: number | null;
}) {
	const scale = Math.max(todayMinutes, goalMinutes ?? 0, 1);
	const sittingMinutes = todayMinutes - earlierMinutes;
	const isMet = goalMinutes !== null && todayMinutes >= goalMinutes;
	return (
		<Tile icon={<Clock className="size-3" />} label="Time" testId="summary-time">
			<Value>{Math.max(1, Math.round(activeMs / 60_000))} min</Value>
			<span
				className="relative flex h-1.5 overflow-visible rounded-full bg-current/10"
				aria-hidden="true"
			>
				<span
					className="h-full rounded-l-full bg-primary/40"
					style={{ width: `${(earlierMinutes / scale) * 100}%` }}
				/>
				<span
					className={cn("h-full bg-primary", earlierMinutes === 0 && "rounded-l-full")}
					style={{ width: `${(sittingMinutes / scale) * 100}%` }}
				/>
				{goalMinutes !== null && (
					<span
						className="absolute -top-0.5 h-2.5 w-0.5 rounded-full bg-foreground"
						style={{ left: `${(goalMinutes / scale) * 100}%` }}
					/>
				)}
			</span>
			<Caption>
				{goalMinutes !== null
					? `Today ${todayMinutes} / ${goalMinutes}m${isMet ? " ✓" : ""}`
					: `Today ${todayMinutes} min`}
			</Caption>
		</Tile>
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

function Sparkline({ points }: { points: number[] }) {
	if (points.length < 2) return null;
	const min = Math.min(...points);
	const span = Math.max(1, Math.max(...points) - min);
	const step = 100 / (points.length - 1);
	const d = points.map((p, i) => `${i * step},${20 - ((p - min) / span) * 18 - 1}`).join(" ");
	return (
		<svg viewBox="0 0 100 20" preserveAspectRatio="none" className="h-4 w-full" aria-hidden="true">
			<polyline
				points={d}
				fill="none"
				stroke="currentColor"
				strokeWidth={1.5}
				vectorEffect="non-scaling-stroke"
				className="text-primary"
			/>
		</svg>
	);
}

export function SpeedTile({ stats, trend }: { stats: SummaryStats; trend: number[] }) {
	const delta = stats.deltaWpm;
	return (
		<Tile
			icon={stats.isRsvp ? <Zap className="size-3" /> : <Gauge className="size-3" />}
			label={stats.isRsvp ? "RSVP speed" : "Speed"}
			testId="summary-speed"
		>
			<span className="flex items-baseline gap-1.5">
				<Value>{stats.wpm ?? "–"}</Value>
				<span className="text-[11px] text-muted-foreground">wpm</span>
				{delta !== null && (
					<span
						className={cn(
							"ml-auto rounded-full px-1.5 text-[10px] tabular-nums",
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
						className="flex items-center gap-2 text-[11px] text-muted-foreground"
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
