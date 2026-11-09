import { SegmentedControl } from "@lesefluss/ui/segmented-control";
import { cn } from "@lesefluss/ui/utils";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { queryHooks } from "../../../services/db/hooks";
import { formatDuration } from "../../../utils/date-utils";
import { AnimatedNumber } from "./animated-number";
import { PERIODS, type Period, type PeriodWindow } from "./period";

const PERIOD_CHIP_LABELS: Record<Period, string> = {
	today: "Today",
	"7d": "7 days",
	"30d": "30 days",
	all: "All time",
};

interface Props {
	/** Page-level locked "now" so query keys stay stable across renders. */
	now: number;
	period: Period;
	range: PeriodWindow;
	onPeriodChange: (period: Period) => void;
}

export function PeriodTabs({
	period,
	onPeriodChange,
	className,
}: {
	period: Period;
	onPeriodChange: (period: Period) => void;
	className?: string;
}) {
	return (
		<div className={cn("flex items-center gap-3", className)}>
			<span className="shrink-0 text-muted-foreground text-xs" aria-hidden="true">
				Totals for
			</span>
			<SegmentedControl
				aria-label="Totals for"
				data-testid="period-control"
				value={period}
				onValueChange={onPeriodChange}
				options={PERIODS.map((p) => ({ value: p, label: PERIOD_CHIP_LABELS[p] }))}
			/>
		</div>
	);
}

export function PeriodTotals({ now, period, range: win, onPeriodChange }: Props) {
	const showPrev = period !== "all";

	const totals = queryHooks.useStatsPeriodTotals(win.start, now);
	const prev = queryHooks.useStatsClosedPeriodTotals(win.prevStart, win.prevEnd, showPrev);

	const isPending = totals.isPending;
	const data = totals.data ?? { minutes: 0, words: 0, booksFinished: 0 };
	const prevData = showPrev ? prev.data : undefined;

	function delta(current: number, previous: number | undefined): number | null {
		if (previous == null || previous === 0) return null;
		return Math.round(((current - previous) / previous) * 100);
	}

	const deltas = prevData
		? {
				minutes: delta(data.minutes, prevData.minutes),
				words: delta(data.words, prevData.words),
				booksFinished: delta(data.booksFinished, prevData.booksFinished),
			}
		: { minutes: null, words: null, booksFinished: null };

	return (
		<section className="mb-8 px-4">
			<PeriodTabs period={period} onPeriodChange={onPeriodChange} className="mb-5" />

			<AnimatePresence mode="wait">
				<motion.div
					key={period}
					initial={{ opacity: 0, y: 8 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: -8 }}
					transition={{ duration: 0.25 }}
					className="grid grid-cols-3 gap-3"
				>
					<Stat
						label="Time"
						value={data.minutes}
						format={(v) => formatDuration(v * 60_000)}
						delta={deltas.minutes}
						period={period}
						isPending={isPending}
					/>
					<Stat
						label="Words"
						value={data.words}
						delta={deltas.words}
						period={period}
						isPending={isPending}
					/>
					<Stat
						label="Finished"
						value={data.booksFinished}
						delta={deltas.booksFinished}
						period={period}
						isPending={isPending}
					/>
				</motion.div>
			</AnimatePresence>
		</section>
	);
}

function Stat({
	label,
	value,
	format,
	delta,
	period,
	isPending,
}: {
	label: string;
	value: number;
	format?: (value: number) => string;
	delta: number | null;
	period: Period;
	isPending: boolean;
}) {
	return (
		<div className="text-center">
			<div className="flex h-9 items-center justify-center font-bold text-3xl tabular-nums tracking-tight">
				{isPending ? (
					<Loader2 aria-label="Loading" className="size-5 animate-spin text-muted-foreground" />
				) : (
					<AnimatedNumber value={value} format={format} />
				)}
			</div>
			<div className="mt-1 text-[0.6875rem] text-muted-foreground uppercase tracking-wider">
				{label}
			</div>
			{/* The line stays while the previous period loads, so the grid keeps its height. */}
			{period !== "all" && (
				<div className="mt-1 h-[15px] font-medium text-[0.625rem] text-muted-foreground">
					{delta != null && `${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta)}%`}
				</div>
			)}
		</div>
	);
}
