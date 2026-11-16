import { isMeasurableSitting, isSkimmedSitting, type SkimCutoffs, wpmFrom } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@lesefluss/ui/dropdown-menu";
import { cn } from "@lesefluss/ui/utils";
import { Check, MoreHorizontal, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { tabBarHidden } from "../../../components/app-shell/tab-bar-visibility";
import { ConfirmDialog } from "../../../components/confirm-dialog";
import { toast } from "../../../components/toast";
import { useBackHandler } from "../../../hooks/use-back-handler";
import { queryHooks } from "../../../services/db/hooks";
import type { Book, ReadingSession } from "../../../services/db/schema";
import { lostReadingDays } from "../../../services/stats/session-delete-impact";
import { formatDuration } from "../../../utils/date-utils";
import { useLongPress } from "../use-long-press";
import {
	CONFIRM_DELETE_FROM,
	deleteConfirmCopy,
	deletedToastText,
	type SessionDay,
} from "./sessions-model";
import { UNDO_WINDOW_MS, useUndoableDelete } from "./use-undoable-delete";

export const MODE_BADGE_LABELS: Record<ReadingSession["mode"], string> = {
	rsvp: "RSVP",
	scroll: "Scroll",
	page: "Page",
	listen: "Listen",
};

export function ModeBadge({ mode }: { mode: ReadingSession["mode"] }) {
	return (
		<span className="inline-flex items-center rounded-sm bg-muted px-1.5 py-0.5 font-semibold text-[0.65rem] text-muted-foreground uppercase tracking-wide">
			{MODE_BADGE_LABELS[mode]}
		</span>
	);
}

/** Rounds like `readingProgress`, so a session's range matches the book's card and detail page. */
export function formatPercent(value: number): string {
	return `${Math.min(100, Math.max(0, Math.round(value)))}%`;
}

export function formatClock(epochMs: number): string {
	return new Date(epochMs).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

type Confirm = { ids: string[]; title: string; description: string; confirmLabel: string };

/**
 * The Sessions delete path: under five sessions it lands at once with an undo,
 * from five on it asks first. `streakRows` are every live session, for the
 * streak warning; a list that only holds one book's rows loads them instead.
 */
export function useSessionDelete({
	books,
	streakRows,
	onStart,
}: {
	books: ReadonlyMap<string, Book>;
	streakRows: () => readonly ReadingSession[] | Promise<readonly ReadingSession[]>;
	onStart: () => void;
}) {
	const deleteMutation = queryHooks.useDeleteReadingSessions();
	const { hidden, deleteNow, deleteLater } = useUndoableDelete(async (ids) => {
		await deleteMutation.mutateAsync(ids);
	});
	const [confirm, setConfirm] = useState<Confirm | null>(null);
	const deciding = useRef(false);

	function proceed(
		doomed: readonly ReadingSession[],
		all: readonly ReadingSession[],
		shouldConfirm: boolean,
		alongside: readonly ReadingSession[],
	) {
		const doomedIds = new Set([...doomed, ...alongside].map((row) => row.id));
		const doomedBooks = new Set(doomed.map((row) => row.bookId));
		const [onlyBook] = doomedBooks;
		const bookTitle =
			doomedBooks.size === 1 && onlyBook ? (books.get(onlyBook)?.title ?? null) : null;
		const live = all.filter((row) => !hidden.has(row.id) || doomedIds.has(row.id));
		const mayChangeStreak = lostReadingDays(doomedIds, live).length > 0;
		const ids = [...doomedIds];
		if (!shouldConfirm && doomed.length < CONFIRM_DELETE_FROM) {
			onStart();
			const undo = deleteLater(ids);
			toast.success(deletedToastText(doomed.length, mayChangeStreak), {
				action: { label: "Undo", onClick: undo },
				duration: UNDO_WINDOW_MS,
			});
			return;
		}
		setConfirm({ ids, ...deleteConfirmCopy(doomed, bookTitle, mayChangeStreak) });
	}

	/**
	 * `confirm` asks first and then deletes at once, with no undo window: the
	 * pages around a delete-all count the sittings until they are really gone.
	 * `alongside` rows go with `doomed` but stay out of the counts, as the
	 * list never showed them (sittings under the one-minute bar).
	 */
	function requestDelete(
		doomed: readonly ReadingSession[],
		{ confirm = false, alongside = [] as readonly ReadingSession[] } = {},
	) {
		if (doomed.length === 0 || deciding.current) return;
		const all = streakRows();
		if (Array.isArray(all)) {
			proceed(doomed, all, confirm, alongside);
			return;
		}
		// The rows stay visible until the read settles; a second tap meanwhile would queue a second delete.
		deciding.current = true;
		void Promise.resolve(all)
			.then(
				(rows) => proceed(doomed, rows, confirm, alongside),
				// Without the other books' sessions every doomed day counts as lost: the warning errs on showing.
				() => proceed(doomed, doomed, confirm, alongside),
			)
			.finally(() => {
				deciding.current = false;
			});
	}

	const dialog = (
		<ConfirmDialog
			open={confirm !== null}
			onOpenChange={(open) => !open && setConfirm(null)}
			title={confirm?.title ?? ""}
			description={confirm?.description}
			confirmLabel={confirm?.confirmLabel}
			destructive
			onConfirm={() => {
				if (!confirm) return;
				onStart();
				deleteNow(confirm.ids);
			}}
		/>
	);

	return { hidden, requestDelete, dialog };
}

export function useSessionSelection() {
	const [selected, setSelected] = useState<ReadonlySet<string> | null>(null);
	useBackHandler(selected !== null, () => setSelected(null));

	function toggle(id: string) {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}

	/** Widens the selection to every row of the books already picked. */
	function selectSameBook(rows: readonly ReadingSession[]) {
		if (!selected) return;
		const picked = new Set(rows.filter((r) => selected.has(r.id)).map((r) => r.bookId));
		setSelected(new Set(rows.filter((r) => picked.has(r.bookId)).map((r) => r.id)));
	}

	return {
		selected,
		start: (id: string) => setSelected(new Set([id])),
		stop: () => setSelected(null),
		toggle,
		selectSameBook,
		setSelected,
	};
}

/** The selecting header: done, the count, and select or deselect everything in `rows`. */
export function SelectionHeader({
	selected,
	rows,
	onDone,
	onSelect,
	className,
}: {
	selected: ReadonlySet<string>;
	rows: readonly ReadingSession[];
	onDone: () => void;
	onSelect: (ids: ReadonlySet<string>) => void;
	className?: string;
}) {
	const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
	return (
		<div className={cn("flex items-center gap-1", className)}>
			<Button variant="ghost" size="icon" aria-label="Done" onClick={onDone}>
				<X />
			</Button>
			<span className="min-w-0 flex-1 truncate font-semibold text-sm">
				{selected.size} selected
			</span>
			<Button
				variant="ghost"
				size="sm"
				disabled={rows.length === 0}
				onClick={() => onSelect(allSelected ? new Set() : new Set(rows.map((r) => r.id)))}
			>
				{allSelected ? "Deselect all" : `Select all ${rows.length}`}
			</Button>
		</div>
	);
}

export type SessionActions = {
	selected: ReadonlySet<string> | null;
	onToggleSelect: (session: ReadingSession) => void;
	onStartSelect: (session: ReadingSession) => void;
	/** Left out where the list already is the book's page. */
	onOpenBook?: (session: ReadingSession) => void;
	/** Left out where the list already shows one book. */
	onOnlyBook?: (session: ReadingSession) => void;
	onDelete: (session: ReadingSession) => void;
	onOpen: (session: ReadingSession) => void;
};

/** Sessions under their day headings; `isBookView` titles each row with its position range. */
export function SessionDays({
	days,
	books,
	isBookView,
	actions,
	skimCutoff,
	listClassName,
	headingClassName,
}: {
	days: readonly SessionDay[];
	books: ReadonlyMap<string, Book>;
	isBookView: boolean;
	actions: SessionActions;
	/** From `skimCutoffs` over the rows the speed figures come from. */
	skimCutoff: SkimCutoffs;
	listClassName?: string;
	headingClassName?: string;
}) {
	const isSelecting = actions.selected !== null;
	return days.map((day) => (
		<section key={day.key} aria-label={day.label}>
			<div
				className={cn(
					"flex justify-between pt-4 pb-1 font-semibold text-muted-foreground text-xs",
					headingClassName,
				)}
			>
				<span>{day.label}</span>
				<span className="tabular-nums">{formatDuration(day.totalMs)}</span>
			</div>
			<ul className={cn("m-0 list-none divide-y divide-border p-0", listClassName)}>
				{day.sessions.map((session) => (
					<SessionItem
						key={session.id}
						session={session}
						book={books.get(session.bookId) ?? null}
						isBookView={isBookView}
						isSkimmed={isSkimmedSitting(session, skimCutoff)}
						isSelecting={isSelecting}
						isSelected={actions.selected?.has(session.id) ?? false}
						onToggleSelect={() => actions.onToggleSelect(session)}
						onStartSelect={() => actions.onStartSelect(session)}
						onOpenBook={actions.onOpenBook && (() => actions.onOpenBook?.(session))}
						onOnlyBook={actions.onOnlyBook && (() => actions.onOnlyBook?.(session))}
						onDelete={() => actions.onDelete(session)}
						onOpen={() => actions.onOpen(session)}
					/>
				))}
			</ul>
		</section>
	));
}

type ItemProps = {
	session: ReadingSession;
	book: Book | null;
	isBookView: boolean;
	isSkimmed: boolean;
	isSelecting: boolean;
	isSelected: boolean;
	onToggleSelect: () => void;
	onStartSelect: () => void;
	onOpenBook?: () => void;
	onOnlyBook?: () => void;
	onDelete: () => void;
	onOpen: () => void;
};

function SessionItem({
	session,
	book,
	isBookView,
	isSkimmed,
	isSelecting,
	isSelected,
	onToggleSelect,
	onStartSelect,
	onOpenBook,
	onOnlyBook,
	onDelete,
	onOpen,
}: ItemProps) {
	const [isMenuOpen, setMenuOpen] = useState(false);
	const press = useLongPress({
		onTap: () => (isSelecting ? onToggleSelect() : onOpen()),
		onMenu: () => setMenuOpen(true),
		onLongPress: onStartSelect,
		enabled: !isSelecting,
	});

	// wpmAvg holds the dial on RSVP rows; show what the sitting delivered, as the speed model does.
	const wpm =
		isMeasurableSitting(session) && !isSkimmed
			? wpmFrom(session.wordsRead, session.durationMs)
			: null;
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
					<span className="block truncate text-sm">{title}</span>
					<span className="mt-0.5 block truncate text-muted-foreground text-xs">
						{formatClock(session.startedAt)} · {MODE_BADGE_LABELS[session.mode]}
					</span>
				</span>
				<span className="shrink-0 text-right text-foreground/80 text-xs tabular-nums">
					<span className="block whitespace-nowrap">{formatDuration(session.durationMs)}</span>
					{wpm != null && <span className="block text-muted-foreground">{wpm} wpm</span>}
					{isSkimmed && <span className="block text-muted-foreground">skimmed</span>}
				</span>
			</button>
			{!isSelecting && (
				<DropdownMenu open={isMenuOpen} onOpenChange={setMenuOpen}>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" size="icon-lg" aria-label="Session actions">
							<MoreHorizontal />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem onSelect={onOpen}>Details</DropdownMenuItem>
						{onOpenBook && <DropdownMenuItem onSelect={onOpenBook}>Open book</DropdownMenuItem>}
						<DropdownMenuItem onSelect={onStartSelect}>Select</DropdownMenuItem>
						{onOnlyBook && (
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

/** The bottom bar while selecting; it stands in for the tab bar. */
export function SelectionBar({
	count,
	onSameBook,
	onDelete,
}: {
	count: number;
	onSameBook?: () => void;
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
			data-toast-clear
			className="fixed inset-x-0 bottom-0 z-40 border-border border-t bg-card pb-[var(--safe-bottom)] md:inset-x-auto md:bottom-6 md:left-[calc(50%+var(--side-nav-w)/2)] md:-translate-x-1/2 md:rounded-xl md:border md:pb-0 md:shadow-lg"
		>
			<div className="flex h-[var(--tab-bar-h)] items-center gap-2 px-3 md:h-12">
				{onSameBook && (
					<Button
						variant="ghost"
						size="sm"
						className="flex-1"
						disabled={count === 0}
						onClick={onSameBook}
					>
						Same book
					</Button>
				)}
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
