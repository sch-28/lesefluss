import { Button } from "@lesefluss/ui/button";
import { cn } from "@lesefluss/ui/utils";
import { ArrowDown, ArrowUp, BookOpen, Play, Plus, Trash2 } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { ActionSheet } from "../../components/action-sheet";
import { EmptyState } from "../../components/empty-state";
import { PageContainer } from "../../components/page-container";
import { queryHooks } from "../../services/db/hooks";
import type { CollectionWithCount } from "../../services/db/queries/collections";
import type { Book } from "../../services/db/schema";
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
import type { LibraryItem } from "./sort-filter";
import VirtualBookGrid from "./virtual-book-grid";

export type OrderedCardOptions = {
	/** The #N the card shows in place of the book's own series badge. */
	seriesNumber: number | null;
	onMenu: () => void;
};

type Props = {
	collection: CollectionWithCount;
	/** The library's items; the view picks its members' book items in #N order. */
	items: readonly LibraryItem[];
	viewMode: "grid" | "list";
	/** The library's own card, so this view looks like every other book view. */
	renderCard: (item: LibraryItem, options: OrderedCardOptions) => React.ReactNode;
	onOpenBook: (book: Book) => void;
	onAddBooks: () => void;
	/** Native drag needs a mouse; touch reorders through Move up / down. */
	canDrag: boolean;
};

type DropTarget = { index: number; after: boolean };
type BookItem = Extract<LibraryItem, { kind: "book" }>;

/**
 * An ordered collection, a series among them: its books in #N order through the
 * library's shared grid and list, reordered by drag or the card menu, every
 * reorder numbering the books 1..N.
 */
const OrderedCollectionView: React.FC<Props> = ({
	collection,
	items,
	viewMode,
	renderCard,
	onOpenBook,
	onAddBooks,
	canDrag,
}) => {
	const members = queryHooks.useCollectionMembers(collection.id);
	const reorder = queryHooks.useReorderCollection();
	const remove = queryHooks.useRemoveBooksFromCollection();
	const isSeries = collection.seriesKey !== null;
	const noun = isSeries ? "series" : "collection";

	const itemsById = useMemo(() => {
		const byId = new Map<string, BookItem>();
		for (const item of items) if (item.kind === "book") byId.set(item.book.id, item);
		return byId;
	}, [items]);
	const booksById = useMemo(
		() => new Map([...itemsById].map(([id, item]) => [id, item.book])),
		[itemsById],
	);
	const stored = useMemo(
		() => orderedRows(members.data ?? [], booksById, isSeries),
		[members.data, booksById, isSeries],
	);
	// The dropped order shows at once; the refetch after the write replaces it.
	const [optimistic, setOptimistic] = useState<OrderedRow[] | null>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: a new stored order is the reset trigger
	useEffect(() => setOptimistic(null), [stored]);
	const rows = optimistic ?? stored;
	const rowItems = useMemo(
		() => rows.flatMap((row) => itemsById.get(row.book.id) ?? []),
		[rows, itemsById],
	);
	const indexOf = useMemo(() => new Map(rows.map((row, i) => [row.book.id, i])), [rows]);

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
	// A grid reads left to right, so a drop lands beside a card; the list stacks.
	const isAfter = (e: React.DragEvent<HTMLElement>) => {
		const box = e.currentTarget.getBoundingClientRect();
		return viewMode === "grid"
			? e.clientX > box.left + box.width / 2
			: e.clientY > box.top + box.height / 2;
	};

	const renderItem = (item: LibraryItem) => {
		if (item.kind !== "book") return null;
		const index = indexOf.get(item.book.id) ?? 0;
		const row = rows[index];
		const edge = dropAt?.index === index ? (dropAt.after ? "after" : "before") : null;
		return (
			<div
				data-testid="ordered-row"
				data-ordered-book={item.book.id}
				onDragStart={canDrag ? () => setDragFrom(index) : undefined}
				onDragOver={
					canDrag
						? (e) => {
								if (dragFrom === null) return;
								e.preventDefault();
								const after = isAfter(e);
								if (dropAt?.index !== index || dropAt.after !== after) setDropAt({ index, after });
							}
						: undefined
				}
				onDrop={
					canDrag
						? (e) => {
								e.preventDefault();
								if (dragFrom !== null && dropAt) {
									move(dragFrom, dropIndex(dragFrom, dropAt.index, dropAt.after));
								}
								endDrag();
							}
						: undefined
				}
				onDragEnd={canDrag ? endDrag : undefined}
				className={cn(
					"rounded-sm",
					dragFrom === index && "opacity-40",
					edge && viewMode === "grid" && "ring-2 ring-primary ring-offset-2 ring-offset-background",
					edge === "before" &&
						viewMode === "list" &&
						"shadow-[inset_0_2px_0_0_var(--color-primary)]",
					edge === "after" &&
						viewMode === "list" &&
						"shadow-[inset_0_-2px_0_0_var(--color-primary)]",
				)}
			>
				{renderCard(item, {
					seriesNumber: row?.shownIndex ?? (isSeries ? null : index + 1),
					onMenu: () => setMenuFor(index),
				})}
			</div>
		);
	};

	return (
		<div data-testid="ordered-collection">
			<PageContainer width="grid" className="px-4 pt-3">
				<p className="m-0 text-muted-foreground text-sm" data-testid="ordered-summary">
					{[seriesAuthor(rows), summaryLabel(orderedSummary(rows))].filter(Boolean).join(" · ")}
				</p>
				{next && (
					<Button
						className="mt-3 w-full md:w-auto"
						data-testid="ordered-next"
						onClick={() => onOpenBook(next.row.book)}
					>
						<Play className="size-4" />
						{next.label}
					</Button>
				)}
			</PageContainer>

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
				<VirtualBookGrid items={rowItems} viewMode={viewMode} renderItem={renderItem} />
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
		</div>
	);
};

export default OrderedCollectionView;
