import { ReservedCard } from "../../../components/reserved-card";
import { queryHooks } from "../../../services/db/hooks";
import { formatDuration, formatRelative } from "../../../utils/date-utils";
import { STAT_ROW_HEIGHT, StatCard, StatRow, StatsSection } from "./section-header";

/** Three record rows in their card, the usual loaded state. */
const RECORDS_HEIGHT = 3 * STAT_ROW_HEIGHT + 2;

/** Rename avoids shadowing the global `Record` type in this file. */
interface PersonalBest {
	label: string;
	value: string;
	detail: string;
}

/** All-time personal bests. Nothing here is period-scoped: a record that reset
 *  every week would not be a record. Speed records live on the Speed tab only. */
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
	if (data?.longestBookFinished) {
		items.push({
			label: "Longest finished",
			value: formatWordCount(data.longestBookFinished.words),
			detail: data.longestBookFinished.title,
		});
	}

	if (data && items.length === 0) return null;

	return (
		<StatsSection title="Records" aside="All time" data-testid="stats-records">
			<ReservedCard isPending={!data} height={RECORDS_HEIGHT}>
				<StatCard>
					{items.map((record) => (
						<StatRow
							key={record.label}
							label={record.label}
							value={record.value}
							detail={record.detail}
						/>
					))}
				</StatCard>
			</ReservedCard>
		</StatsSection>
	);
}

/** Thousands read better at book length, but a short work must not round to
 *  "0k words". */
function formatWordCount(words: number): string {
	return words < 1000 ? `${words} words` : `${Math.round(words / 1000)}k words`;
}
