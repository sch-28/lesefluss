import { readingProgress } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import { Progress } from "@lesefluss/ui/progress";
import { cn } from "@lesefluss/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import {
	ArrowDown,
	ArrowUp,
	BookOpen,
	ChevronRight,
	GripVertical,
	MoreHorizontal,
	Pencil,
	Plus,
	Trash2,
} from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { ActionSheet } from "../../components/action-sheet";
import BookCover from "../../components/book-cover";
import { CollectionActions } from "../../components/collections/collection-actions";
import { RenameCollectionDialog } from "../../components/collections/rename-collection-dialog";
import { formatSeriesNumber } from "../../components/collections/series-numbering";
import { queryHooks } from "../../services/db/hooks";
import type { CollectionWithCount } from "../../services/db/queries/collections";
import type { Book } from "../../services/db/schema";
import CardMoreButton from "./card-more-button";
import {
	dropIndex,
	moveItem,
	type OrderedRow,
	orderedRows,
	orderedSummary,
	renumber,
	summaryLabel,
} from "./ordered-collection";
import { isBookFinished } from "./sort-filter";

type Props = {
	collection: CollectionWithCount;
	collections: CollectionWithCount[];
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
	collections,
	books,
	covers,
	onOpenBook,
	onAddBooks,
	canDrag,
}) => {
	const navigate = useNavigate();
	const members = queryHooks.useCollectionMembers(collection.id);
	const reorder = queryHooks.useReorderCollection();
	const remove = queryHooks.useRemoveBooksFromCollection();
	const isSeries = collection.seriesKey !== null;
	const noun = isSeries ? "series" : "collection";

	const booksById = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);
	const stored = useMemo(
		() => orderedRows(members.data ?? [], booksById),
		[members.data, booksById],
	);
	// The dropped order shows at once; the refetch after the write replaces it.
	const [optimistic, setOptimistic] = useState<OrderedRow[] | null>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: a new stored order is the reset trigger
	useEffect(() => setOptimistic(null), [stored]);
	const rows = optimistic ?? stored;

	const [dragFrom, setDragFrom] = useState<number | null>(null);
	const [dropAt, setDropAt] = useState<DropTarget | null>(null);
	const [menuFor, setMenuFor] = useState<number | null>(null);
	const [isRenaming, setIsRenaming] = useState(false);
	const [actionsOpen, setActionsOpen] = useState(false);

	const commit = (next: OrderedRow[]) => {
		const order = renumber(next);
		if (order.length === 0) return;
		setOptimistic(next.map((row, i) => ({ ...row, seriesIndex: i + 1 })));
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

	return (
		<div data-testid="ordered-collection">
			<div className="border-border border-b px-4 py-3">
				<nav
					aria-label="Breadcrumb"
					className="flex items-center gap-1 text-muted-foreground text-xs"
				>
					<button
						type="button"
						onClick={() => navigate({ to: "/tabs/library", search: {} })}
						className="rounded-sm border-0 bg-transparent p-0 text-muted-foreground hover:text-foreground"
					>
						Library
					</button>
					<ChevronRight aria-hidden className="size-3" />
					{isSeries && (
						<>
							<span>Series</span>
							<ChevronRight aria-hidden className="size-3" />
						</>
					)}
					<span aria-current="page" className="min-w-0 truncate text-foreground">
						{collection.name}
					</span>
				</nav>
				<div className="mt-1 flex items-center gap-2">
					<div className="min-w-0 flex-1">
						<h2 className="m-0 truncate font-semibold text-lg">{collection.name}</h2>
						<p className="m-0 text-muted-foreground text-sm" data-testid="ordered-summary">
							{summaryLabel(orderedSummary(rows))}
						</p>
					</div>
					<Button variant="outline" size="sm" onClick={() => setIsRenaming(true)}>
						<Pencil className="size-4" />
						Rename
					</Button>
					<Button size="sm" onClick={onAddBooks}>
						<Plus className="size-4" />
						Add books
					</Button>
					<Button
						variant="ghost"
						size="icon"
						aria-label={`${collection.name} options`}
						onClick={() => setActionsOpen(true)}
					>
						<MoreHorizontal />
					</Button>
				</div>
			</div>

			{members.isSuccess && rows.length === 0 ? (
				<div className="flex min-h-[50vh] flex-col items-center justify-center p-8 text-center text-muted-foreground">
					<h2 className="m-0 mb-2 font-semibold text-foreground text-lg">
						No books in this {noun} yet
					</h2>
					<Button className="mt-4" onClick={onAddBooks}>
						<Plus className="size-4" />
						Add books
					</Button>
				</div>
			) : (
				<ol
					className="m-0 list-none p-4 pb-24 content-container"
					aria-label={`${collection.name} books`}
				>
					{rows.map((row, index) => (
						<OrderedBookRow
							key={row.book.id}
							row={row}
							cover={covers.get(row.book.id)}
							showNumber={isSeries}
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
			<RenameCollectionDialog
				open={isRenaming}
				onOpenChange={setIsRenaming}
				collection={collection}
			/>
			<CollectionActions
				collection={actionsOpen ? collection : null}
				collections={collections}
				onClose={() => setActionsOpen(false)}
			/>
		</div>
	);
};

type RowProps = {
	row: OrderedRow;
	cover: string | undefined;
	showNumber: boolean;
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
	const progress = readingProgress(book);
	const finished = isBookFinished(book) || book.finishedAt !== null;
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
				"group relative flex items-center gap-3 border-border border-b py-2",
				isDragging && "opacity-40",
				dropEdge === "before" && "shadow-[inset_0_2px_0_0_var(--color-primary)]",
				dropEdge === "after" && "shadow-[inset_0_-2px_0_0_var(--color-primary)]",
			)}
		>
			{canDrag && (
				<GripVertical aria-hidden className="size-4 shrink-0 cursor-grab text-muted-foreground" />
			)}
			{showNumber && (
				<span
					data-testid="ordered-number"
					className="w-10 shrink-0 text-right font-semibold text-muted-foreground text-sm tabular-nums"
				>
					{row.seriesIndex !== null ? formatSeriesNumber(row.seriesIndex) : ""}
				</span>
			)}
			<button
				type="button"
				onClick={onOpen}
				aria-label={book.title}
				className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-sm border-0 bg-transparent p-0 text-left text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
			>
				<div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-sm">
					<BookCover book={book} cover={cover} size="full" />
				</div>
				<div className="min-w-0 flex-1">
					<div className="line-clamp-2 font-semibold text-[0.9rem] leading-[1.2]">{book.title}</div>
					{book.author && (
						<div className="mt-0.5 truncate text-[0.8rem] text-muted-foreground">{book.author}</div>
					)}
					{progress > 0 && !finished && (
						<Progress
							value={progress}
							className="mt-1.5 h-1 max-w-48"
							aria-label="Reading progress"
						/>
					)}
				</div>
			</button>
			<span className="w-16 shrink-0 text-right text-muted-foreground text-xs tabular-nums">
				{finished ? "Finished" : progress > 0 ? `${progress}%` : "New"}
			</span>
			<CardMoreButton title={book.title} onMenu={onMenu} className="shrink-0" />
		</li>
	);
};

export default OrderedCollectionView;
