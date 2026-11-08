import { isSkimmedSitting, skimCutoffWpm } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
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
		() => skimCutoffWpm(filterSessions(allQuery.data ?? [], { mode: "all", hidden })),
		[allQuery.data, hidden],
	);
	const [openSession, setOpenSession] = useState<ReadingSession | null>(null);
	const days = useMemo(() => takeSessions(groupByDay(rows, now), BOOK_SESSIONS_SHOWN), [rows, now]);
	const { selected } = selection;

	if (rows.length === 0) return dialog;

	const noun = rows.length === 1 ? "session" : "sessions";
	return (
		<section
			aria-label="Sessions"
			className="mt-6 rounded-lg border border-border bg-card p-4 text-card-foreground"
		>
			{selected ? (
				<SelectionHeader
					selected={selected}
					rows={rows}
					onDone={selection.stop}
					onSelect={selection.setSelected}
					className="-mx-2 -my-1"
				/>
			) : (
				<div className="flex items-baseline justify-between gap-2">
					<h2 className="m-0 font-semibold text-base">
						Sessions <span className="text-muted-foreground">· {rows.length}</span>
					</h2>
					<Link
						to="/tabs/stats"
						search={{ tab: "sessions", book: book.id }}
						className="text-primary text-sm"
					>
						{rows.length > BOOK_SESSIONS_SHOWN ? `See all ${rows.length}` : "In Stats"}
					</Link>
				</div>
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

			{!selected && (
				<Button
					variant="ghost"
					size="sm"
					className="mt-2 text-destructive hover:text-destructive"
					onClick={() => requestDelete(rows)}
				>
					Delete all {rows.length} {noun}
				</Button>
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
