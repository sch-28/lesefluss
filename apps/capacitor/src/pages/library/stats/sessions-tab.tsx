import { isSkimmedSitting, READING_MODES, skimCutoffs } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import { cn } from "@lesefluss/ui/utils";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { FilterChip } from "../../../components/filter-chip";
import { queryHooks } from "../../../services/db/hooks";
import { bookKeys } from "../../../services/db/hooks/query-keys";
import { queries } from "../../../services/db/queries";
import type { Book, ReadingSession } from "../../../services/db/schema";
import { formatDuration } from "../../../utils/date-utils";
import { SessionDetailSheet } from "./session-detail-sheet";
import {
	MODE_BADGE_LABELS,
	SelectionBar,
	SelectionHeader,
	SessionDays,
	useSessionDelete,
	useSessionSelection,
} from "./session-list";
import {
	bookFilterOptions,
	filterSessions,
	groupByDay,
	type ModeFilter,
	shortSessionsOf,
	takeSessions,
	totalsOf,
} from "./sessions-model";

const PAGE_SIZE = 50;

interface Props {
	/** Page-level locked "now", for the Today and Yesterday labels. */
	now: number;
	bookId?: string;
	onBookChange: (bookId: string | undefined) => void;
}

export function SessionsTab({ now, bookId, onBookChange }: Props) {
	const router = useRouter();
	const sessionsQuery = queryHooks.useAllReadingSessions();
	const booksQuery = useQuery({
		queryKey: bookKeys.allIncludingChapters,
		queryFn: () => queries.getAllBooks(),
	});

	const [mode, setMode] = useState<ModeFilter>("all");
	const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
	const [openSession, setOpenSession] = useState<ReadingSession | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: a new filter starts at the first page
	useEffect(() => setVisibleCount(PAGE_SIZE), [bookId, mode]);

	const all = sessionsQuery.data ?? [];
	const books = useMemo(() => {
		const map = new Map<string, Book>();
		for (const book of booksQuery.data ?? []) map.set(book.id, book);
		return map;
	}, [booksQuery.data]);

	const selection = useSessionSelection();
	const { hidden, requestDelete, dialog } = useSessionDelete({
		books,
		streakRows: () => all,
		onStart: selection.stop,
	});
	const live = useMemo(() => filterSessions(all, { mode: "all", hidden }), [all, hidden]);
	const rows = useMemo(
		() => filterSessions(live, { bookId, mode, hidden }),
		[live, bookId, mode, hidden],
	);
	const bookRows = useMemo(
		() => (bookId ? filterSessions(live, { bookId, mode: "all", hidden }) : []),
		[live, bookId, hidden],
	);
	const skimCutoff = useMemo(() => skimCutoffs(live), [live]);
	const totals = totalsOf(rows, skimCutoff);
	const days = useMemo(
		() => takeSessions(groupByDay(rows, now), visibleCount),
		[rows, now, visibleCount],
	);
	const bookOptions = useMemo(() => bookFilterOptions(live, books), [live, books]);

	const titleOf = (id: string) => books.get(id)?.title ?? "Unknown book";
	const { selected } = selection;
	const isSelecting = selected !== null;

	if (sessionsQuery.isPending) {
		return (
			<div className="flex justify-center py-10">
				<Loader2 className="size-5 animate-spin text-muted-foreground" />
			</div>
		);
	}

	const bookTotals = totalsOf(bookRows, skimCutoff);

	return (
		<div
			className={cn("pb-6", isSelecting && "pb-[calc(var(--tab-bar-h)+var(--safe-bottom)+1.5rem)]")}
		>
			{selected ? (
				<SelectionHeader
					selected={selected}
					rows={rows}
					onDone={selection.stop}
					onSelect={selection.setSelected}
					className="px-2 py-2"
				/>
			) : (
				<div className="px-4 py-3">
					<div className="flex items-center gap-2">
						<FilterChip
							label={bookId ? titleOf(bookId) : "All books"}
							isActive={bookId !== undefined}
							value={bookId ?? ""}
							options={bookOptions}
							onSelect={(id) => onBookChange(id || undefined)}
							onClear={() => onBookChange(undefined)}
							className="min-w-0 shrink"
						/>
						<FilterChip<ModeFilter>
							label={mode === "all" ? "All modes" : MODE_BADGE_LABELS[mode]}
							isActive={mode !== "all"}
							value={mode}
							options={[
								{ value: "all", label: "All modes" },
								...READING_MODES.map((m) => ({ value: m, label: MODE_BADGE_LABELS[m] })),
							]}
							onSelect={setMode}
							onClear={() => setMode("all")}
						/>
						<Button
							variant="ghost"
							size="sm"
							className="ml-auto"
							disabled={rows.length === 0}
							onClick={() => selection.setSelected(new Set())}
						>
							Select
						</Button>
					</div>
					<p className="m-0 mt-2 text-muted-foreground text-xs tabular-nums">
						{totals.count} {totals.count === 1 ? "session" : "sessions"} ·{" "}
						{formatDuration(totals.totalMs)} total
					</p>
				</div>
			)}

			{bookId && !isSelecting && (
				<section className="mx-4 mb-2 rounded-lg border border-border bg-card p-4 text-card-foreground">
					<div className="truncate font-semibold">{titleOf(bookId)}</div>
					<div className="mt-1 text-muted-foreground text-xs tabular-nums">
						{bookTotals.count} {bookTotals.count === 1 ? "session" : "sessions"} ·{" "}
						{formatDuration(bookTotals.totalMs)}
						{bookTotals.wpm !== null && ` · ${bookTotals.wpm} wpm`}
					</div>
					{bookTotals.count > 0 && (
						<Button
							variant="destructive"
							size="sm"
							className="mt-3"
							onClick={() =>
								requestDelete(bookRows, { alongside: shortSessionsOf(all, bookId, hidden) })
							}
						>
							Delete all {bookTotals.count} {bookTotals.count === 1 ? "session" : "sessions"}
						</Button>
					)}
				</section>
			)}

			{rows.length === 0 ? (
				<p className="px-4 py-8 text-center text-muted-foreground text-sm">No sessions</p>
			) : (
				<SessionDays
					days={days}
					books={books}
					isBookView={bookId !== undefined}
					skimCutoff={skimCutoff}
					headingClassName="px-4"
					listClassName="px-4"
					actions={{
						selected,
						onToggleSelect: (session) => selection.toggle(session.id),
						onStartSelect: (session) => selection.start(session.id),
						onOpenBook: (session) =>
							router.navigate({ to: "/tabs/library/book/$id", params: { id: session.bookId } }),
						onOnlyBook:
							bookId === undefined ? (session) => onBookChange(session.bookId) : undefined,
						onDelete: (session) => requestDelete([session]),
						onOpen: setOpenSession,
					}}
				/>
			)}

			{rows.length > visibleCount && (
				<div className="mt-3 flex justify-center">
					<Button variant="ghost" size="sm" onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}>
						Show more ({rows.length - visibleCount} left)
					</Button>
				</div>
			)}

			{selected && (
				<SelectionBar
					count={selected.size}
					onSameBook={() => selection.selectSameBook(live)}
					onDelete={() => requestDelete(live.filter((row) => selected.has(row.id)))}
				/>
			)}

			<SessionDetailSheet
				session={openSession}
				book={openSession ? (books.get(openSession.bookId) ?? null) : null}
				isSkimmed={openSession !== null && isSkimmedSitting(openSession, skimCutoff)}
				onClose={() => setOpenSession(null)}
				onDelete={(session) => requestDelete([session])}
			/>
			{dialog}
		</div>
	);
}
