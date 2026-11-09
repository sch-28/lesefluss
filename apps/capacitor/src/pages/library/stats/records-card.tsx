import { motion } from "framer-motion";
import { ReservedCard } from "../../../components/reserved-card";
import { queryHooks } from "../../../services/db/hooks";
import { formatDuration, formatRelative } from "../../../utils/date-utils";

/** Two rows of record tiles, the usual loaded state. */
const RECORDS_GRID_HEIGHT = 181;

/** Rename avoids shadowing the global `Record` type in this file. */
interface PersonalBest {
	label: string;
	value: string;
	detail: string;
}

/** All-time personal bests. Nothing here is period-scoped: a record that reset
 *  every week would not be a record. */
export function RecordsCard() {
	const records = queryHooks.useStatsRecords();
	const data = records.data;

	const items: PersonalBest[] = [];
	if (data?.longestSitting) {
		items.push({
			label: "Longest sitting",
			value: formatDuration(data.longestSitting.durationMs),
			detail: `${data.longestSitting.title} · ${formatRelative(data.longestSitting.at)}`,
		});
	}
	if (data?.bestDay) {
		items.push({
			label: "Best day",
			value: formatDuration(data.bestDay.durationMs),
			detail: formatRelative(data.bestDay.dayStart),
		});
	}
	if (data?.fastestBook) {
		items.push({
			label: "Fastest read",
			value: `${data.fastestBook.wpm} wpm`,
			detail: data.fastestBook.title,
		});
	}
	if (data?.longestBookFinished) {
		items.push({
			label: "Longest finished",
			value: formatWordCount(data.longestBookFinished.words),
			detail: data.longestBookFinished.title,
		});
	}

	if (data && items.length === 0) return null;

	return (
		<motion.section
			initial={{ opacity: 0, y: 12 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, amount: 0.25 }}
			transition={{ duration: 0.5 }}
			className="mb-10 px-4"
		>
			<header className="mb-3">
				<h2 className="font-semibold text-lg">Records</h2>
				<p className="mt-0.5 text-[0.6875rem] uppercase tracking-wider opacity-60">all time</p>
			</header>
			<ReservedCard isPending={!data} height={RECORDS_GRID_HEIGHT}>
				<div className="grid grid-cols-2 gap-2.5">
					{items.map((record) => (
						<div
							key={record.label}
							className="rounded-xl border border-current/10 bg-card p-3 text-card-foreground"
						>
							<div className="font-semibold text-xl tabular-nums leading-none tracking-tight">
								{record.value}
							</div>
							<div className="mt-1.5 text-[0.625rem] uppercase tracking-wider opacity-60">
								{record.label}
							</div>
							<div className="mt-1 line-clamp-1 text-[0.6875rem] opacity-50">{record.detail}</div>
						</div>
					))}
				</div>
			</ReservedCard>
		</motion.section>
	);
}

/** Thousands read better at book length, but a short work must not round to
 *  "0k words". */
function formatWordCount(words: number): string {
	return words < 1000 ? `${words} words` : `${Math.round(words / 1000)}k words`;
}
