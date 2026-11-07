import { READING_MODES } from "@lesefluss/core";
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
import type { Book } from "../../../services/db/schema";
import { formatDuration } from "../../../utils/date-utils";
import {
	MODE_BADGE_LABELS,
	SelectionBar,
	SelectionHeader,
	SessionDays,
	useSessionDelete,
	useSessionSelection,
} from "./session-list";
import {
	filterSessions,
	groupByDay,
	type ModeFilter,
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
	const totals = totalsOf(rows);
	const days = useMemo(
		() => takeSessions(groupByDay(rows, now), visibleCount),
		[rows, now, visibleCount],
	);
	const bookOptions = useMemo(() => {
		const counts = new Map<string, number>();
		for (const row of live) counts.set(row.bookId, (counts.get(row.bookId) ?? 0) + 1);
		return [...counts]
			.map(([id, count]) => ({ value: id, label: books.get(id)?.title ?? "Unknown book", count }))
			.sort((a, b) => a.label.localeCompare(b.label));
	}, [live, books]);

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

	const bookTotals = totalsOf(bookRows);

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
				<div className="flex items-center gap-2 px-4 py-3">
					<FilterChip
						label={bookId ? titleOf(bookId) : "All books"}
						isActive={bookId !== undefined}
						value={bookId ?? ""}
						options={bookOptions}
						onSelect={(id) => onBookChange(id)}
						onClear={() => onBookChange(undefined)}
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
					<span className="ml-auto shrink-0 text-muted-foreground text-xs tabular-nums">
						{totals.count} · {formatDuration(totals.totalMs)}
					</span>
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
							onClick={() => requestDelete(bookRows)}
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

			{dialog}
		</div>
	);
}
