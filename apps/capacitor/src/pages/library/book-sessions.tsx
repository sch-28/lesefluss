import { isSkimmedSitting, skimCutoffs } from "@lesefluss/core";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { queryHooks } from "../../services/db/hooks";
import { queries } from "../../services/db/queries";
import type { Book, ReadingSession } from "../../services/db/schema";
import { SessionDetailSheet } from "./stats/session-detail-sheet";
import {
	SelectionBar,
	SelectionHeader,
	SessionDays,
	useSessionDelete,
	useSessionSelection,
} from "./stats/session-list";
import { filterSessions, groupByDay, takeSessions } from "./stats/sessions-model";

/** The latest sittings the book page lists; the rest are a link away in Stats › Sessions. */
export const BOOK_SESSIONS_SHOWN = 10;

/** The book's sessions as Stats › Sessions shows them, scoped to this book. */
export function BookSessions({ book }: { book: Book }) {
	const sessionsQuery = queryHooks.useBookReadingSessions(book.id);
	const allQuery = queryHooks.useAllReadingSessions();
	const [now] = useState(Date.now);
	const books = useMemo(() => new Map([[book.id, book]]), [book]);
	const selection = useSessionSelection();
	const { hidden, requestDelete, dialog } = useSessionDelete({
		books,
		streakRows: () => queries.getAllReadingSessions(),
		onStart: selection.stop,
	});

	const rows = useMemo(
		() => filterSessions(sessionsQuery.data ?? [], { mode: "all", hidden }),
		[sessionsQuery.data, hidden],
	);
	// From every sitting, as Stats › Sessions does, so a row reads skimmed the same in both.
	const skimCutoff = useMemo(
		() => skimCutoffs(filterSessions(allQuery.data ?? [], { mode: "all", hidden })),
		[allQuery.data, hidden],
	);
	const [openSession, setOpenSession] = useState<ReadingSession | null>(null);
	const days = useMemo(() => takeSessions(groupByDay(rows, now), BOOK_SESSIONS_SHOWN), [rows, now]);
	const { selected } = selection;

	if (rows.length === 0) return dialog;

	return (
		<section aria-label="Sessions" className="book-detail-card mt-4">
			{selected ? (
				<SelectionHeader
					selected={selected}
					rows={rows}
					onDone={selection.stop}
					onSelect={selection.setSelected}
					className="-mx-2 -my-1"
				/>
			) : (
				<h2 className="book-detail-section-title">
					Sessions <span className="font-normal opacity-50">· {rows.length}</span>
				</h2>
			)}

			<SessionDays
				days={days}
				books={books}
				isBookView
				skimCutoff={skimCutoff}
				actions={{
					selected,
					onToggleSelect: (session) => selection.toggle(session.id),
					onStartSelect: (session) => selection.start(session.id),
					onDelete: (session) => requestDelete([session]),
					onOpen: setOpenSession,
				}}
			/>

			{!selected && rows.length > BOOK_SESSIONS_SHOWN && (
				<Link
					to="/tabs/stats"
					search={{ tab: "sessions", book: book.id, from: "book" }}
					className="self-start text-primary text-sm underline underline-offset-4"
				>
					All {rows.length} sessions in Stats
				</Link>
			)}

			{selected && (
				<>
					<div className="h-[calc(var(--tab-bar-h)+var(--safe-bottom))]" />
					<SelectionBar
						count={selected.size}
						onDelete={() => requestDelete(rows.filter((row) => selected.has(row.id)))}
					/>
				</>
			)}

			<SessionDetailSheet
				session={openSession}
				book={book}
				isSkimmed={openSession !== null && isSkimmedSitting(openSession, skimCutoff)}
				onClose={() => setOpenSession(null)}
				onDelete={(session) => requestDelete([session])}
			/>
			{dialog}
		</section>
	);
}
