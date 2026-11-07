import { READING_MODES } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@lesefluss/ui/dropdown-menu";
import { cn } from "@lesefluss/ui/utils";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { Check, Loader2, MoreHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { tabBarHidden } from "../../../components/app-shell/tab-bar-visibility";
import { ConfirmDialog } from "../../../components/confirm-dialog";
import { FilterChip } from "../../../components/filter-chip";
import { toast } from "../../../components/toast";
import { queryHooks } from "../../../services/db/hooks";
import { bookKeys } from "../../../services/db/hooks/query-keys";
import { queries } from "../../../services/db/queries";
import type { Book, ReadingSession } from "../../../services/db/schema";
import { lostReadingDays } from "../../../services/stats/session-delete-impact";
import { formatDuration } from "../../../utils/date-utils";
import { formatClock, formatPercent, MODE_BADGE_LABELS, ModeBadge } from "../session-table";
import { useLongPress } from "../use-long-press";
import {
	CONFIRM_DELETE_FROM,
	deleteConfirmCopy,
	deletedToastText,
	filterSessions,
	groupByDay,
	type ModeFilter,
	takeSessions,
	totalsOf,
} from "./sessions-model";
import { UNDO_WINDOW_MS, useUndoableDelete } from "./use-undoable-delete";

const PAGE_SIZE = 50;

type Confirm = { ids: string[]; title: string; description: string; confirmLabel: string };

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
	const deleteMutation = queryHooks.useDeleteReadingSessions();
	const { hidden, deleteNow, deleteLater } = useUndoableDelete(async (ids) => {
		await deleteMutation.mutateAsync(ids);
	});

	const [mode, setMode] = useState<ModeFilter>("all");
	const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
	const [selected, setSelected] = useState<ReadonlySet<string> | null>(null);
	const [confirm, setConfirm] = useState<Confirm | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: a new filter starts at the first page
	useEffect(() => setVisibleCount(PAGE_SIZE), [bookId, mode]);

	const all = sessionsQuery.data ?? [];
	const books = useMemo(() => {
		const map = new Map<string, Book>();
		for (const book of booksQuery.data ?? []) map.set(book.id, book);
		return map;
	}, [booksQuery.data]);

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
	const isSelecting = selected !== null;

	function requestDelete(ids: readonly string[]) {
		const doomedIds = new Set(ids);
		const doomed = live.filter((row) => doomedIds.has(row.id));
		if (doomed.length === 0) return;
		const doomedBooks = new Set(doomed.map((row) => row.bookId));
		const [onlyBook] = doomedBooks;
		const bookTitle =
			doomedBooks.size === 1 && onlyBook ? (books.get(onlyBook)?.title ?? null) : null;
		const mayChangeStreak = lostReadingDays(doomedIds, live).length > 0;
		const doomedList = doomed.map((row) => row.id);
		if (doomedList.length < CONFIRM_DELETE_FROM) {
			setSelected(null);
			const undo = deleteLater(doomedList);
			toast.success(deletedToastText(doomedList.length, mayChangeStreak), {
				action: { label: "Undo", onClick: undo },
				duration: UNDO_WINDOW_MS,
			});
			return;
		}
		setConfirm({ ids: doomedList, ...deleteConfirmCopy(doomed, bookTitle, mayChangeStreak) });
	}

	function toggle(id: string) {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}

	function selectSameBook() {
		if (!selected) return;
		const picked = new Set(live.filter((r) => selected.has(r.id)).map((r) => r.bookId));
		setSelected(new Set(live.filter((r) => picked.has(r.bookId)).map((r) => r.id)));
	}

	if (sessionsQuery.isPending) {
		return (
			<div className="flex justify-center py-10">
				<Loader2 className="size-5 animate-spin text-muted-foreground" />
			</div>
		);
	}

	const allSelected = selected !== null && rows.length > 0 && rows.every((r) => selected.has(r.id));
	const bookTotals = totalsOf(bookRows);

	return (
		<div
			className={cn("pb-6", isSelecting && "pb-[calc(var(--tab-bar-h)+var(--safe-bottom)+1.5rem)]")}
		>
			{selected ? (
				<div className="flex items-center gap-1 px-2 py-2">
					<Button variant="ghost" size="icon" aria-label="Done" onClick={() => setSelected(null)}>
						<X />
					</Button>
					<span className="min-w-0 flex-1 truncate font-semibold text-sm">
						{selected.size} selected
					</span>
					<Button
						variant="ghost"
						size="sm"
						disabled={rows.length === 0}
						onClick={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))}
					>
						{allSelected ? "Deselect all" : `Select all ${rows.length}`}
					</Button>
				</div>
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
							onClick={() => requestDelete(bookRows.map((r) => r.id))}
						>
							Delete all {bookTotals.count} {bookTotals.count === 1 ? "session" : "sessions"}
						</Button>
					)}
				</section>
			)}

			{rows.length === 0 ? (
				<p className="px-4 py-8 text-center text-muted-foreground text-sm">No sessions</p>
			) : (
				days.map((day) => (
					<section key={day.key} aria-label={day.label}>
						<div className="flex justify-between px-4 pt-4 pb-1 font-semibold text-muted-foreground text-xs">
							<span>{day.label}</span>
							<span className="tabular-nums">{formatDuration(day.totalMs)}</span>
						</div>
						<ul className="m-0 list-none divide-y divide-border p-0 px-4">
							{day.sessions.map((session) => (
								<SessionItem
									key={session.id}
									session={session}
									book={books.get(session.bookId) ?? null}
									isBookView={bookId !== undefined}
									isSelecting={isSelecting}
									isSelected={selected?.has(session.id) ?? false}
									onToggleSelect={() => toggle(session.id)}
									onStartSelect={() => setSelected(new Set([session.id]))}
									onOpenBook={() =>
										router.navigate({
											to: "/tabs/library/book/$id",
											params: { id: session.bookId },
										})
									}
									onOnlyBook={() => onBookChange(session.bookId)}
									onDelete={() => requestDelete([session.id])}
								/>
							))}
						</ul>
					</section>
				))
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
					onSameBook={selectSameBook}
					onDelete={() => requestDelete([...selected])}
				/>
			)}

			<ConfirmDialog
				open={confirm !== null}
				onOpenChange={(open) => !open && setConfirm(null)}
				title={confirm?.title ?? ""}
				description={confirm?.description}
				confirmLabel={confirm?.confirmLabel}
				destructive
				onConfirm={() => {
					if (!confirm) return;
					setSelected(null);
					deleteNow(confirm.ids);
				}}
			/>
		</div>
	);
}

type ItemProps = {
	session: ReadingSession;
	book: Book | null;
	isBookView: boolean;
	isSelecting: boolean;
	isSelected: boolean;
	onToggleSelect: () => void;
	onStartSelect: () => void;
	onOpenBook: () => void;
	onOnlyBook: () => void;
	onDelete: () => void;
};

function SessionItem({
	session,
	book,
	isBookView,
	isSelecting,
	isSelected,
	onToggleSelect,
	onStartSelect,
	onOpenBook,
	onOnlyBook,
	onDelete,
}: ItemProps) {
	const [isMenuOpen, setMenuOpen] = useState(false);
	const press = useLongPress({
		onTap: () => (isSelecting ? onToggleSelect() : setMenuOpen(true)),
		onMenu: () => setMenuOpen(true),
		onLongPress: onStartSelect,
		enabled: !isSelecting,
	});

	const wordCount = book?.wordCount ?? 0;
	const title =
		isBookView && wordCount > 0
			? `${formatPercent((session.startWord / wordCount) * 100)} → ${formatPercent((session.endWord / wordCount) * 100)}`
			: (book?.title ?? "Unknown book");

	return (
		<li className="flex items-center gap-2">
			<button
				type="button"
				{...press}
				aria-pressed={isSelecting ? isSelected : undefined}
				className="flex min-w-0 flex-1 cursor-pointer select-none items-center gap-3 border-0 bg-transparent px-0 py-3 text-left text-foreground"
			>
				{isSelecting && (
					<span
						className={cn(
							"flex size-5 shrink-0 items-center justify-center rounded border border-border",
							isSelected && "border-primary bg-primary text-primary-foreground",
						)}
					>
						{isSelected && <Check className="size-3.5" />}
					</span>
				)}
				<span className="min-w-0 flex-1">
					<span className="flex items-center gap-2">
						<span className="truncate text-sm">{title}</span>
						{session.mode === "rsvp" && <ModeBadge mode="rsvp" />}
					</span>
					<span className="mt-0.5 block truncate text-muted-foreground text-xs">
						{formatClock(session.startedAt)} · {MODE_BADGE_LABELS[session.mode]}
					</span>
				</span>
				<span className="shrink-0 text-right text-foreground/80 text-xs tabular-nums">
					<span className="block">{formatDuration(session.durationMs)}</span>
					{session.wpmAvg != null && (
						<span className="block text-muted-foreground">{session.wpmAvg} wpm</span>
					)}
				</span>
			</button>
			{!isSelecting && (
				<DropdownMenu open={isMenuOpen} onOpenChange={setMenuOpen}>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" size="icon-xs" aria-label="Session actions">
							<MoreHorizontal />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem onSelect={onOpenBook}>Open book</DropdownMenuItem>
						<DropdownMenuItem onSelect={onStartSelect}>Select</DropdownMenuItem>
						{!isBookView && (
							<DropdownMenuItem onSelect={onOnlyBook}>Only this book</DropdownMenuItem>
						)}
						<DropdownMenuSeparator />
						<DropdownMenuItem variant="destructive" onSelect={onDelete}>
							Delete session
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			)}
		</li>
	);
}

function SelectionBar({
	count,
	onSameBook,
	onDelete,
}: {
	count: number;
	onSameBook: () => void;
	onDelete: () => void;
}) {
	useEffect(() => {
		tabBarHidden.set(true);
		return () => tabBarHidden.set(false);
	}, []);

	return (
		<div
			role="toolbar"
			aria-label="Selection"
			className="fixed inset-x-0 bottom-0 z-40 border-border border-t bg-card pb-[var(--safe-bottom)] md:inset-x-auto md:bottom-6 md:left-[calc(50%+var(--side-nav-w)/2)] md:-translate-x-1/2 md:rounded-xl md:border md:pb-0 md:shadow-lg"
		>
			<div className="flex h-[var(--tab-bar-h)] items-center gap-2 px-3 md:h-12">
				<Button
					variant="ghost"
					size="sm"
					className="flex-1"
					disabled={count === 0}
					onClick={onSameBook}
				>
					Same book
				</Button>
				<Button
					variant="destructive"
					size="sm"
					className="flex-1"
					disabled={count === 0}
					onClick={onDelete}
				>
					Delete {count}
				</Button>
			</div>
		</div>
	);
}
