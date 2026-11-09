import { MIN_MODEL_ACTIVE_MS, type SpeedModel } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import { cn } from "@lesefluss/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import {
	BookOpen,
	Gauge,
	Lock,
	type LucideIcon,
	Moon,
	Timer,
	TrendingDown,
	Type,
} from "lucide-react";
import { ReservedCard } from "../../../../components/reserved-card";
import { queryHooks } from "../../../../services/db/hooks";
import type { Insight, InsightId, LockedInsight } from "../../../../services/stats/insights";
import { type SpeedView, timeSavedMs } from "../../../../services/stats/speed-tab";
import { formatDuration, formatShortDate } from "../../../../utils/date-utils";
import { STAT_ROW_HEIGHT, StatCard, StatRow, StatsSection } from "../section-header";
import { deliveredPercent } from "./rsvp-dial";

function formatWords(words: number): string {
	if (words >= 1_000_000) return `${(words / 1_000_000).toFixed(1)}M words`;
	if (words >= 1000) return `${Math.round(words / 1000)}k words`;
	return `${words} words`;
}

const INSIGHT_ICONS: Record<InsightId, LucideIcon> = {
	"time-of-day": Moon,
	"scroll-vs-page": BookOpen,
	fatigue: TrendingDown,
	"font-size": Type,
};

/** Every insight of a view shows, open or locked, so the loaded list has a known length. */
const INSIGHT_ROWS: Record<SpeedView, number> = { reading: 4, rsvp: 5 };

function IconCircle({ icon: Icon, isLocked }: { icon: LucideIcon; isLocked?: boolean }) {
	return (
		<span
			aria-hidden="true"
			className={cn(
				"flex size-10 shrink-0 items-center justify-center rounded-full",
				isLocked
					? "border border-border border-dashed text-muted-foreground"
					: "bg-muted text-primary",
			)}
		>
			<Icon className="size-5" />
		</span>
	);
}

function ProgressBar({ fraction }: { fraction: number }) {
	return (
		<div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
			<div
				className="h-full bg-primary"
				style={{ width: `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%` }}
			/>
		</div>
	);
}

function InsightRow({
	icon,
	label,
	value,
	sub,
	testId,
}: {
	icon: LucideIcon;
	label: string;
	value: string;
	sub?: string;
	testId: string;
}) {
	return (
		<StatRow
			data-testid={testId}
			icon={<IconCircle icon={icon} />}
			label={
				<span className="text-[0.9375rem]">
					{label}: <b className="font-semibold">{value}</b>
				</span>
			}
			sub={sub}
		/>
	);
}

function LockedRow({ locked }: { locked: LockedInsight }) {
	return (
		<StatRow
			data-testid={`insight-locked-${locked.id}`}
			icon={<IconCircle icon={Lock} isLocked />}
			label={<span className="text-[0.9375rem] text-muted-foreground">{locked.title}</span>}
			sub={`${locked.need} · ${locked.progressLabel}`}
		/>
	);
}

/** Until the reader has ten minutes, the speed itself is the first thing to unlock. */
function SpeedLockedRow({ activeMs }: { activeMs: number }) {
	const doneMin = Math.floor(activeMs / 60_000);
	const needMin = MIN_MODEL_ACTIVE_MS / 60_000;
	const left = Math.max(1, needMin - doneMin);
	return (
		<StatRow
			data-testid="speed-locked"
			icon={<IconCircle icon={Gauge} isLocked />}
			label={
				<span className="text-[0.9375rem]">
					Read{" "}
					<b className="font-semibold">
						{left} more {left === 1 ? "minute" : "minutes"}
					</b>{" "}
					to see your speed
				</span>
			}
			sub={
				<>
					<ProgressBar fraction={activeMs / MIN_MODEL_ACTIVE_MS} />
					<span className="mt-1 block tabular-nums">
						{Math.min(doneMin, needMin)} of {needMin} min · the trend follows
					</span>
				</>
			}
		/>
	);
}

function RsvpRows({ model }: { model: SpeedModel }) {
	const saved = timeSavedMs(model);
	const ratio = model.rsvp?.deliveredRatio ?? null;
	return (
		<>
			{saved > 0 && model.rsvp && (
				<InsightRow
					testId="time-saved"
					icon={Timer}
					label="Time saved"
					value={formatDuration(saved)}
					sub={`${formatWords(model.rsvp.words)} at ${model.rsvp.wpm} instead of ${model.reading.wpm} wpm`}
				/>
			)}
			{ratio !== null && (
				<InsightRow
					testId="delivered-of-dial"
					icon={Gauge}
					label="Delivered of dial"
					value={`${deliveredPercent(ratio)}%`}
					sub={model.rsvp?.dialWpm != null ? `Avg dial ${model.rsvp.dialWpm}` : undefined}
				/>
			)}
		</>
	);
}

export function SpeedInsights({ model, view }: { model: SpeedModel; view: SpeedView }) {
	const { data, isPending } = queryHooks.useStatsSpeedInsights();
	const insights: Insight[] = data?.[view] ?? [];
	const locked: LockedInsight[] = data?.locked[view] ?? [];
	const speedLocked = view === "reading" && model.reading.source === "default";
	return (
		<StatsSection
			title="Insights"
			aside={locked.length > 0 || speedLocked ? "Unlock as you read" : undefined}
			data-testid="speed-insights"
		>
			<ReservedCard isPending={isPending} height={INSIGHT_ROWS[view] * STAT_ROW_HEIGHT}>
				<div className="[&>*:last-child]:border-b-0">
					{speedLocked && <SpeedLockedRow activeMs={model.reading.activeMs} />}
					{view === "rsvp" && <RsvpRows model={model} />}
					{insights.map((insight) => (
						<InsightRow
							key={insight.id}
							testId={`insight-${insight.id}`}
							icon={INSIGHT_ICONS[insight.id]}
							label={insight.label}
							value={insight.value}
							sub={insight.sub}
						/>
					))}
					{locked.map((l) => (
						<LockedRow key={l.id} locked={l} />
					))}
				</div>
			</ReservedCard>
		</StatsSection>
	);
}

/** Two rows in their card: one best and the speed test. */
const PERSONAL_BESTS_HEIGHT = 2 * STAT_ROW_HEIGHT + 2;

function SpeedTestRow() {
	const navigate = useNavigate();
	const latest = queryHooks.useSpeedTests().data?.[0];
	return (
		<StatRow
			data-testid="speed-test-card"
			label="Speed test"
			sub={
				latest
					? `${formatShortDate(latest.createdAt)} · ${latest.readingWpm} wpm`
					: "Not taken yet · 1 minute"
			}
			action={
				<Button
					variant="outline"
					className="h-11"
					aria-label="Test my speed"
					onClick={() => void navigate({ to: "/speed-test" })}
				>
					<Gauge />
					Test
				</Button>
			}
		/>
	);
}

function BestRow({
	label,
	value,
	detail,
}: {
	label: string;
	value: React.ReactNode;
	detail: string;
}) {
	return <StatRow label={label} value={value} detail={detail} />;
}

function Wpm({ wpm }: { wpm: number }) {
	return (
		<>
			{wpm} <small className="font-normal text-muted-foreground text-xs">wpm</small>
		</>
	);
}

/** All-time records of both modes, with the speed test as the last row. */
export function PersonalBests() {
	const { data, isPending } = queryHooks.useStatsSpeedTab();
	const records = data?.records;
	const hasBest =
		!!records &&
		!!(
			records.fastestSitting ||
			records.bestRsvpSitting ||
			records.fastestBook ||
			records.longestRsvpRun
		);
	return (
		<StatsSection title="Personal bests" aside="All time" data-testid="speed-records">
			<ReservedCard isPending={isPending} height={PERSONAL_BESTS_HEIGHT}>
				<StatCard>
					{records?.fastestSitting && (
						<BestRow
							label="Fastest sitting"
							value={<Wpm wpm={records.fastestSitting.wpm} />}
							detail={`${records.fastestSitting.title} · ${formatShortDate(records.fastestSitting.at)}`}
						/>
					)}
					{records?.bestRsvpSitting && (
						<BestRow
							label="Fastest RSVP sitting"
							value={<Wpm wpm={records.bestRsvpSitting.wpm} />}
							detail={`${records.bestRsvpSitting.title} · ${formatShortDate(records.bestRsvpSitting.at)}`}
						/>
					)}
					{records?.fastestBook && (
						<BestRow
							label="Fastest book"
							value={<Wpm wpm={records.fastestBook.wpm} />}
							detail={records.fastestBook.title}
						/>
					)}
					{records?.longestRsvpRun && (
						<BestRow
							label="Longest RSVP run"
							value={formatDuration(records.longestRsvpRun.durationMs)}
							detail={`${records.longestRsvpRun.title} · ${formatShortDate(records.longestRsvpRun.at)}`}
						/>
					)}
					{!hasBest && (
						<StatRow
							label={<span className="text-muted-foreground">Your best sittings show here</span>}
							sub="Once your speed appears"
						/>
					)}
					<SpeedTestRow />
				</StatCard>
			</ReservedCard>
		</StatsSection>
	);
}
