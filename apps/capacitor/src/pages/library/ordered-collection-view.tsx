import { bookPace } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import { cn } from "@lesefluss/ui/utils";
import { ArrowDown, ArrowUp, BookOpen, GripVertical, Play, Plus, Trash2 } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { ActionSheet } from "../../components/action-sheet";
import BookCover from "../../components/book-cover";
import { formatSeriesNumber } from "../../components/collections/series-numbering";
import { EmptyState } from "../../components/empty-state";
import { PageContainer } from "../../components/page-container";
import { queryHooks } from "../../services/db/hooks";
import type { CollectionWithCount } from "../../services/db/queries/collections";
import type { Book } from "../../services/db/schema";
import { estimateMinutesLeft } from "../../utils/reading-time";
import { cardStatus, StatusField } from "./card-fields";
import CardMoreButton from "./card-more-button";
import {
	dropIndex,
	moveItem,
	nextInSeries,
	type OrderedRow,
	orderedRows,
	orderedSummary,
	renumber,
	seriesAuthor,
	summaryLabel,
} from "./ordered-collection";

type Props = {
	collection: CollectionWithCount;
	books: readonly Book[];
	covers: ReadonlyMap<string, string>;
	onOpenBook: (book: Book) => void;
	onAddBooks: () => void;
	/** Native drag needs a mouse; touch reorders through Move up / down. */
	canDrag: boolean;
};

type DropTarget = { index: number; after: boolean };

/**
 * An ordered collection, a series among them: its books in #N order, reordered
 * by drag or the row menu, every reorder numbering the rows 1..N.
 */
const OrderedCollectionView: React.FC<Props> = ({
	collection,
	books,
	covers,
	onOpenBook,
	onAddBooks,
	canDrag,
}) => {
	const members = queryHooks.useCollectionMembers(collection.id);
	const reorder = queryHooks.useReorderCollection();
	const remove = queryHooks.useRemoveBooksFromCollection();
	const isSeries = collection.seriesKey !== null;
	const noun = isSeries ? "series" : "collection";

	const booksById = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);
	const stored = useMemo(
		() => orderedRows(members.data ?? [], booksById, isSeries),
		[members.data, booksById, isSeries],
	);
	// The dropped order shows at once; the refetch after the write replaces it.
	const [optimistic, setOptimistic] = useState<OrderedRow[] | null>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: a new stored order is the reset trigger
	useEffect(() => setOptimistic(null), [stored]);
	const rows = optimistic ?? stored;

	const [dragFrom, setDragFrom] = useState<number | null>(null);
	const [dropAt, setDropAt] = useState<DropTarget | null>(null);
	const [menuFor, setMenuFor] = useState<number | null>(null);

	const commit = (next: OrderedRow[]) => {
		const order = renumber(next);
		if (order.length === 0) return;
		setOptimistic(next.map((row, i) => ({ ...row, seriesIndex: i + 1, shownIndex: i + 1 })));
		reorder.mutate({ collectionId: collection.id, order }, { onError: () => setOptimistic(null) });
	};

	const move = (from: number, to: number) => {
		if (from === to || to < 0 || to >= rows.length) return;
		commit(moveItem(rows, from, to));
	};

	const endDrag = () => {
		setDragFrom(null);
		setDropAt(null);
	};

	const menuRow = menuFor !== null ? rows[menuFor] : undefined;
	const next = isSeries ? nextInSeries(rows) : null;
	const speedModel = queryHooks.useStatsSpeedModel().data;
	const minutesToRead = (book: Book) =>
		speedModel ? estimateMinutesLeft(book, bookPace(speedModel, book.id).wpm) : null;

	return (
		<PageContainer width="grid" data-testid="ordered-collection">
			<div className="px-4 pt-3 pb-4">
				<p className="m-0 text-muted-foreground text-sm" data-testid="ordered-summary">
					{[seriesAuthor(rows), summaryLabel(orderedSummary(rows))].filter(Boolean).join(" · ")}
				</p>
				{next && (
					<Button
						className="mt-3 h-11 w-full md:w-auto"
						data-testid="ordered-next"
						onClick={() => onOpenBook(next.row.book)}
					>
						<Play className="size-4" />
						{next.label}
					</Button>
				)}
			</div>

			{members.isSuccess && rows.length === 0 ? (
				<EmptyState
					icon={BookOpen}
					title={`No books in this ${noun} yet`}
					className="min-h-[50vh]"
					action={
						<Button onClick={onAddBooks}>
							<Plus className="size-4" />
							Add books
						</Button>
					}
				/>
			) : (
				<ol className="m-0 list-none p-4 pb-24" aria-label={`${collection.name} books`}>
					{rows.map((row, index) => (
						<OrderedBookRow
							key={row.book.id}
							row={row}
							cover={covers.get(row.book.id)}
							showNumber={isSeries}
							minutesToRead={minutesToRead(row.book)}
							canDrag={canDrag}
							isDragging={dragFrom === index}
							dropEdge={dropAt?.index === index ? (dropAt.after ? "after" : "before") : null}
							onOpen={() => onOpenBook(row.book)}
							onMenu={() => setMenuFor(index)}
							onDragStart={(e) => {
								e.stopPropagation();
								e.dataTransfer.effectAllowed = "move";
								e.dataTransfer.setData("text/plain", row.book.title);
								setDragFrom(index);
							}}
							onDragOver={(e) => {
								if (dragFrom === null) return;
								e.preventDefault();
								const box = e.currentTarget.getBoundingClientRect();
								const after = e.clientY > box.top + box.height / 2;
								if (dropAt?.index !== index || dropAt.after !== after) setDropAt({ index, after });
							}}
							onDrop={(e) => {
								e.preventDefault();
								if (dragFrom !== null && dropAt) {
									move(dragFrom, dropIndex(dragFrom, dropAt.index, dropAt.after));
								}
								endDrag();
							}}
							onDragEnd={endDrag}
						/>
					))}
				</ol>
			)}

			<ActionSheet
				open={!!menuRow}
				onOpenChange={(open) => {
					if (!open) setMenuFor(null);
				}}
				title={menuRow?.book.title}
				items={[
					{
						label: "Open",
						icon: BookOpen,
						onSelect: () => {
							if (menuRow) onOpenBook(menuRow.book);
						},
					},
					{
						label: "Move up",
						icon: ArrowUp,
						disabled: menuFor === null || menuFor <= 0,
						onSelect: () => {
							if (menuFor !== null) move(menuFor, menuFor - 1);
						},
					},
					{
						label: "Move down",
						icon: ArrowDown,
						disabled: menuFor === null || menuFor >= rows.length - 1,
						onSelect: () => {
							if (menuFor !== null) move(menuFor, menuFor + 1);
						},
					},
					{
						label: `Remove from ${noun}`,
						icon: Trash2,
						destructive: true,
						onSelect: () => {
							if (menuRow)
								remove.mutate({ collectionId: collection.id, bookIds: [menuRow.book.id] });
						},
					},
				]}
			/>
		</PageContainer>
	);
};

type RowProps = {
	row: OrderedRow;
	cover: string | undefined;
	showNumber: boolean;
	/** The whole book at the reader's pace; null before the pace is known. */
	minutesToRead: number | null;
	canDrag: boolean;
	isDragging: boolean;
	dropEdge: "before" | "after" | null;
	onOpen: () => void;
	onMenu: () => void;
	onDragStart: (e: React.DragEvent<HTMLLIElement>) => void;
	onDragOver: (e: React.DragEvent<HTMLLIElement>) => void;
	onDrop: (e: React.DragEvent<HTMLLIElement>) => void;
	onDragEnd: () => void;
};

const OrderedBookRow: React.FC<RowProps> = ({
	row,
	cover,
	showNumber,
	minutesToRead,
	canDrag,
	isDragging,
	dropEdge,
	onOpen,
	onMenu,
	onDragStart,
	onDragOver,
	onDrop,
	onDragEnd,
}) => {
	const { book } = row;
	return (
		<li
			data-testid="ordered-row"
			data-ordered-book={book.id}
			draggable={canDrag}
			onDragStart={canDrag ? onDragStart : undefined}
			onDragOver={canDrag ? onDragOver : undefined}
			onDrop={canDrag ? onDrop : undefined}
			onDragEnd={canDrag ? onDragEnd : undefined}
			className={cn(
				"group relative flex min-h-16 items-center gap-3 border-border border-b py-1",
				isDragging && "opacity-40",
				dropEdge === "before" && "shadow-[inset_0_2px_0_0_var(--color-primary)]",
				dropEdge === "after" && "shadow-[inset_0_-2px_0_0_var(--color-primary)]",
			)}
		>
			{canDrag && (
				<GripVertical aria-hidden className="size-4 shrink-0 cursor-grab text-muted-foreground" />
			)}
			<button
				type="button"
				onClick={onOpen}
				aria-label={book.title}
				className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-sm border-0 bg-transparent p-0 text-left text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
			>
				<div className="relative h-15 w-10 shrink-0 overflow-hidden rounded-sm">
					<BookCover book={book} cover={cover} size="full" />
				</div>
				<div className="min-w-0 flex-1">
					<div className="truncate font-medium text-[0.875rem] leading-5">
						{showNumber && row.shownIndex !== null && (
							<span
								data-testid="ordered-number"
								className="font-normal text-muted-foreground tabular-nums"
							>
								{formatSeriesNumber(row.shownIndex)}{" "}
							</span>
						)}
						{book.title}
					</div>
					{book.author && !showNumber && (
						<div className="truncate text-[0.75rem] text-muted-foreground leading-4">
							{book.author}
						</div>
					)}
					<div className="mt-1 flex h-4 items-center text-[0.75rem] leading-4">
						<StatusField status={cardStatus(book, minutesToRead)} />
					</div>
				</div>
			</button>
			<CardMoreButton title={book.title} onMenu={onMenu} className="shrink-0" />
		</li>
	);
};

export default OrderedCollectionView;
