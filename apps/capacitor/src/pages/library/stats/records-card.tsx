import { isSkimmedSitting, skimCutoffs } from "@lesefluss/core";
import { ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { ReservedCard } from "../../../components/reserved-card";
import { queryHooks } from "../../../services/db/hooks";
import { queries } from "../../../services/db/queries";
import { formatDuration, formatRelative } from "../../../utils/date-utils";
import { STAT_ROW_HEIGHT, StatCard, StatRow, StatsSection } from "./section-header";
import { SessionDetailSheet } from "./session-detail-sheet";
import { useSessionDelete } from "./session-list";
import { filterSessions } from "./sessions-model";

/** Three record rows in their card, the usual loaded state. */
const RECORDS_HEIGHT = 3 * STAT_ROW_HEIGHT + 2;

/** Rename avoids shadowing the global `Record` type in this file. */
interface PersonalBest {
	label: string;
	value: string;
	detail: string;
	onOpen?: () => void;
}

/** All-time personal bests. Nothing here is period-scoped: a record that reset
 *  every week would not be a record. Speed records live on the Speed tab only. */
export function RecordsCard() {
	const records = queryHooks.useStatsRecords();
	const data = records.data;
	const [openSessionId, setOpenSessionId] = useState<string | null>(null);
	// Stays mounted after the first tap: a delete's undo window lives in the sheet's hook.
	const [sheetMounted, setSheetMounted] = useState(false);

	const items: PersonalBest[] = [];
	if (data?.longestSitting) {
		items.push({
			label: "Longest sitting",
			value: formatDuration(data.longestSitting.durationMs),
			detail: `${data.longestSitting.title} · ${formatRelative(data.longestSitting.at)}`,
			onOpen: () => {
				setSheetMounted(true);
				setOpenSessionId(data.longestSitting?.sessionId ?? null);
			},
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
					{items.map((record) => {
						const row = (
							<StatRow
								key={record.label}
								label={record.label}
								value={record.value}
								detail={record.detail}
								action={
									record.onOpen && (
										<ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
									)
								}
							/>
						);
						return record.onOpen ? (
							<button
								key={record.label}
								type="button"
								onClick={record.onOpen}
								className="block w-full text-left hover:opacity-80 [&:last-child>div]:border-b-0"
								data-testid="record-longest-sitting"
							>
								{row}
							</button>
						) : (
							row
						);
					})}
				</StatCard>
			</ReservedCard>
			{sheetMounted && (
				<RecordSessionSheet sessionId={openSessionId} onClose={() => setOpenSessionId(null)} />
			)}
		</StatsSection>
	);
}

/** Thousands read better at book length, but a short work must not round to
 *  "0k words". */
function formatWordCount(words: number): string {
	return words < 1000 ? `${words} words` : `${Math.round(words / 1000)}k words`;
}

/** The record's sitting in the same sheet Stats › Sessions opens, loaded only once tapped. */
function RecordSessionSheet({
	sessionId,
	onClose,
}: {
	sessionId: string | null;
	onClose: () => void;
}) {
	const sessions = queryHooks.useAllReadingSessions();
	const session = (sessionId && sessions.data?.find((s) => s.id === sessionId)) || null;
	const { data: book } = queryHooks.useBook(session?.bookId ?? "");
	const books = useMemo(() => new Map(book ? [[book.id, book]] : []), [book]);
	const { hidden, requestDelete, dialog } = useSessionDelete({
		books,
		streakRows: () => queries.getAllReadingSessions(),
		onStart: onClose,
	});
	const skimCutoff = useMemo(
		() => skimCutoffs(filterSessions(sessions.data ?? [], { mode: "all", hidden })),
		[sessions.data, hidden],
	);
	return (
		<>
			<SessionDetailSheet
				session={session && !hidden.has(session.id) ? session : null}
				book={book ?? null}
				isSkimmed={session !== null && isSkimmedSitting(session, skimCutoff)}
				onClose={onClose}
				onDelete={(s) => requestDelete([s])}
			/>
			{dialog}
		</>
	);
}
