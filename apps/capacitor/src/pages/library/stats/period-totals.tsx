import { Tabs, TabsList, TabsTrigger } from "@lesefluss/ui/tabs";
import { AnimatePresence, motion } from "framer-motion";
import { queryHooks } from "../../../services/db/hooks";
import { formatDuration } from "../../../utils/date-utils";
import { AnimatedNumber } from "./animated-number";
import { isPeriod, type Period, type PeriodWindow } from "./period";

interface Props {
	/** Page-level locked "now" so query keys stay stable across renders. */
	now: number;
	period: Period;
	range: PeriodWindow;
	onPeriodChange: (period: Period) => void;
}

export function PeriodTotals({ now, period, range: win, onPeriodChange }: Props) {
	const showPrev = period !== "all";

	const totals = queryHooks.useStatsPeriodTotals(win.start, now);
	const prev = queryHooks.useStatsClosedPeriodTotals(win.prevStart, win.prevEnd, showPrev);

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
			<Tabs
				value={period}
				onValueChange={(v) => {
					if (isPeriod(v)) onPeriodChange(v);
				}}
				className="mb-5"
			>
				<TabsList className="w-full">
					<TabsTrigger value="today">Today</TabsTrigger>
					<TabsTrigger value="7d">7d</TabsTrigger>
					<TabsTrigger value="30d">30d</TabsTrigger>
					<TabsTrigger value="all">All</TabsTrigger>
				</TabsList>
			</Tabs>

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
					/>
					<Stat label="Words" value={data.words} delta={deltas.words} period={period} />
					<Stat
						label="Finished"
						value={data.booksFinished}
						delta={deltas.booksFinished}
						period={period}
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
}: {
	label: string;
	value: number;
	format?: (value: number) => string;
	delta: number | null;
	period: Period;
}) {
	return (
		<div className="text-center">
			<div className="font-bold text-3xl tabular-nums tracking-tight">
				<AnimatedNumber value={value} format={format} />
			</div>
			<div className="mt-1 text-[11px] text-muted-foreground uppercase tracking-wider">{label}</div>
			{period !== "all" && delta != null && (
				<div
					className={`mt-1 font-medium text-[10px] ${
						delta >= 0 ? "text-emerald-500" : "text-rose-500"
					}`}
				>
					{delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}%
				</div>
			)}
		</div>
	);
}
