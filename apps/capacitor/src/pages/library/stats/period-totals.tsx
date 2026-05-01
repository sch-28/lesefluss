import { IonLabel, IonSegment, IonSegmentButton } from "@ionic/react";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { queryHooks } from "../../../services/db/hooks";
import { startOfLocalDay } from "../../../utils/date-utils";
import { AnimatedNumber } from "./animated-number";

const MS_PER_DAY = 86_400_000;

const PERIODS = ["today", "7d", "30d", "all"] as const;
type Period = (typeof PERIODS)[number];

function isPeriod(value: unknown): value is Period {
	return typeof value === "string" && (PERIODS as readonly string[]).includes(value);
}

function periodWindow(
	p: Period,
	now: number,
): { start: number; prevStart: number; prevEnd: number } {
	switch (p) {
		case "today": {
			const start = startOfLocalDay(now);
			return { start, prevStart: start - MS_PER_DAY, prevEnd: start };
		}
		case "7d": {
			const start = startOfLocalDay(now) - 6 * MS_PER_DAY;
			return { start, prevStart: start - 7 * MS_PER_DAY, prevEnd: start };
		}
		case "30d": {
			const start = startOfLocalDay(now) - 29 * MS_PER_DAY;
			return { start, prevStart: start - 30 * MS_PER_DAY, prevEnd: start };
		}
		default: {
			return { start: 0, prevStart: 0, prevEnd: 0 };
		}
	}
}

interface Props {
	/** Page-level locked "now" so query keys stay stable across renders. */
	now: number;
}

export function PeriodTotals({ now }: Props) {
	const [period, setPeriod] = useState<Period>("7d");
	const win = useMemo(() => periodWindow(period, now), [period, now]);
	const showPrev = period !== "all";

	const totals = queryHooks.useStatsPeriodTotals(win.start, now);
	const prev = queryHooks.useStatsPeriodTotals(win.prevStart, win.prevEnd, showPrev);

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
			<IonSegment
				value={period}
				onIonChange={(e) => {
					if (isPeriod(e.detail.value)) setPeriod(e.detail.value);
				}}
				className="mb-5"
			>
				<IonSegmentButton value="today">
					<IonLabel>Today</IonLabel>
				</IonSegmentButton>
				<IonSegmentButton value="7d">
					<IonLabel>7d</IonLabel>
				</IonSegmentButton>
				<IonSegmentButton value="30d">
					<IonLabel>30d</IonLabel>
				</IonSegmentButton>
				<IonSegmentButton value="all">
					<IonLabel>All</IonLabel>
				</IonSegmentButton>
			</IonSegment>

			<AnimatePresence mode="wait">
				<motion.div
					key={period}
					initial={{ opacity: 0, y: 8 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: -8 }}
					transition={{ duration: 0.25 }}
					className="grid grid-cols-3 gap-3"
				>
					<Stat label="Minutes" value={data.minutes} delta={deltas.minutes} period={period} />
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
	delta,
	period,
}: {
	label: string;
	value: number;
	delta: number | null;
	period: Period;
}) {
	return (
		<div className="text-center">
			<div className="font-bold text-3xl tabular-nums tracking-tight">
				<AnimatedNumber value={value} />
			</div>
			<div className="mt-1 text-[11px] uppercase tracking-wider opacity-60">{label}</div>
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
