import { cn } from "@lesefluss/ui/utils";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight } from "lucide-react";
import type React from "react";
import { useMemo, useRef } from "react";
import { Virtualizer } from "virtua";
import type { Book, Series } from "../../services/db/schema";
import CardMoreButton from "./card-more-button";
import { itemKey, type LibraryGroup, layoutRows } from "./group-by";
import { type LibraryItem, type SortBy, sortDirection } from "./sort-filter";
import type { CellContext, TableColumn } from "./table-columns";
import { useScroller } from "./virtual-book-grid";

const ROW_PX = 44;
const NONE_COLLAPSED: ReadonlySet<string> = new Set();

type Selection = {
	isSelecting: boolean;
	isSelected: (bookId: string) => boolean;
	toggle: (bookId: string) => void;
	selectRange: (bookId: string) => void;
};

type Props = {
	items: readonly LibraryItem[];
	groups?: readonly LibraryGroup[] | null;
	collapsed?: ReadonlySet<string>;
	onToggleGroup?: (groupKey: string) => void;
	columns: readonly TableColumn[];
	ctx: CellContext;
	sortBy: SortBy;
	reversed: boolean;
	onHeaderSort: (sortBy: SortBy) => void;
	selection: Selection;
	onOpenBook: (book: Book) => void;
	onOpenSeries: (series: Series) => void;
	onBookMenu: (book: Book) => void;
	onSeriesMenu: (series: Series) => void;
	/** Mouse drag onto a sidebar collection; the library's root sets the drag data. */
	draggable: boolean;
	containerRef?: React.RefObject<HTMLDivElement | null>;
};

/**
 * The desktop table: one row per book or serial, only the rows near the
 * viewport rendered, group headings as full-width rows.
 */
const LibraryTable: React.FC<Props> = ({
	items,
	groups = null,
	collapsed = NONE_COLLAPSED,
	onToggleGroup,
	columns,
	ctx,
	sortBy,
	reversed,
	onHeaderSort,
	selection,
	onOpenBook,
	onOpenSeries,
	onBookMenu,
	onSeriesMenu,
	draggable,
	containerRef,
}) => {
	const ownAnchor = useRef<HTMLDivElement>(null);
	const anchor = containerRef ?? ownAnchor;
	const { scrollRef, startMargin } = useScroller(anchor);
	const rows = useMemo(() => layoutRows(items, groups, 1, collapsed), [items, groups, collapsed]);
	const template = `2.5rem ${columns.map((c) => c.width).join(" ")} 2.5rem`;
	const dir = sortDirection(sortBy, reversed);

	const onRowClick = (item: LibraryItem, e: React.MouseEvent) => {
		if (item.kind === "series") {
			if (!selection.isSelecting) onOpenSeries(item.series);
			return;
		}
		const { book } = item;
		if (e.shiftKey) selection.selectRange(book.id);
		else if (e.ctrlKey || e.metaKey || selection.isSelecting) selection.toggle(book.id);
		else onOpenBook(book);
	};

	const onRowMenu = (item: LibraryItem) =>
		item.kind === "book" ? onBookMenu(item.book) : onSeriesMenu(item.series);

	return (
		<div className="px-4 pb-24" data-testid="library-table">
			<div
				className="sticky top-[calc(var(--safe-top,0px)+3rem)] z-10 grid items-center border-border border-b bg-background text-muted-foreground text-xs"
				style={{ gridTemplateColumns: template }}
			>
				<span />
				{columns.map((column) => {
					const isSorted = column.sortBy === sortBy;
					const Arrow = dir === "asc" ? ArrowUp : ArrowDown;
					return (
						<span
							key={column.id}
							data-column={column.id}
							className={cn("min-w-0 px-2 py-2", column.align === "end" && "text-right")}
						>
							{column.sortBy ? (
								<button
									type="button"
									aria-label={
										isSorted
											? `${column.label}, sorted ${dir === "asc" ? "ascending" : "descending"}`
											: `Sort by ${column.label}`
									}
									onClick={() => column.sortBy && onHeaderSort(column.sortBy)}
									className={cn(
										"inline-flex max-w-full items-center gap-1 rounded-sm border-0 bg-transparent p-0 font-medium text-muted-foreground hover:text-foreground",
										isSorted && "text-foreground",
									)}
								>
									<span className="truncate">{column.label}</span>
									{isSorted && <Arrow aria-hidden className="size-3 shrink-0" />}
								</button>
							) : (
								<span className="truncate font-medium">{column.label}</span>
							)}
						</span>
					);
				})}
				<span />
			</div>
			<div ref={anchor}>
				<Virtualizer
					scrollRef={scrollRef}
					startMargin={startMargin}
					bufferSize={600}
					itemSize={ROW_PX}
				>
					{rows.map((row) => {
						if (row.type === "header") {
							const Chevron = row.collapsed ? ChevronRight : ChevronDown;
							return (
								<div key={`\u0001${row.group.key}`} className="pt-3 pb-1">
									<button
										type="button"
										aria-expanded={!row.collapsed}
										data-testid="library-group-header"
										onClick={() => onToggleGroup?.(row.group.key)}
										className="flex w-full items-center gap-2 rounded-md border-0 bg-transparent px-1 py-1.5 text-left text-foreground hover:bg-muted"
									>
										<Chevron className="size-4 shrink-0 text-muted-foreground" />
										<span className="min-w-0 truncate font-semibold text-sm">
											{row.group.label}
										</span>
										<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
											{row.group.items.length}
										</span>
									</button>
								</div>
							);
						}
						const item = row.items[0] as LibraryItem;
						const isBook = item.kind === "book";
						const title = isBook ? item.book.title : item.series.title;
						const selected = isBook && selection.isSelected(item.book.id);
						const dimmed = !isBook && selection.isSelecting;
						return (
							<div
								key={row.key}
								data-table-row={itemKey(item)}
								className={cn(
									"group grid items-center border-border border-b text-sm hover:bg-muted/50",
									selected && "bg-primary/10 hover:bg-primary/15",
									dimmed && "pointer-events-none opacity-40",
								)}
								style={{ gridTemplateColumns: template, minHeight: ROW_PX }}
							>
								<span className="flex justify-center">
									{isBook && (
										<input
											type="checkbox"
											aria-label={`Select ${title}`}
											checked={selected}
											readOnly
											onClick={(e) => {
												if (e.shiftKey) selection.selectRange(item.book.id);
												else selection.toggle(item.book.id);
											}}
											className={cn(
												"size-4 cursor-pointer accent-primary",
												!selection.isSelecting &&
													"opacity-0 focus-visible:opacity-100 group-hover:opacity-100",
											)}
										/>
									)}
								</span>
								<button
									type="button"
									aria-label={title}
									aria-pressed={isBook && selection.isSelecting ? selected : undefined}
									data-book-id={isBook ? item.book.id : undefined}
									data-selected={selected ? "true" : undefined}
									draggable={isBook && draggable}
									onClick={(e) => onRowClick(item, e)}
									onContextMenu={(e) => {
										e.preventDefault();
										onRowMenu(item);
									}}
									className="grid cursor-pointer select-none grid-cols-subgrid items-center self-stretch rounded-sm border-0 bg-transparent p-0 text-left text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
									style={{ gridColumn: `2 / span ${columns.length}` }}
								>
									{columns.map((column) => (
										<span
											key={column.id}
											className={cn(
												"min-w-0 truncate px-2 py-2",
												column.id === "title" ? "font-medium" : "text-muted-foreground",
												column.align === "end" && "text-right tabular-nums",
											)}
										>
											{column.text(item, ctx)}
										</span>
									))}
								</button>
								<span className="flex justify-center">
									<CardMoreButton title={title} onMenu={() => onRowMenu(item)} />
								</span>
							</div>
						);
					})}
				</Virtualizer>
			</div>
		</div>
	);
};

export default LibraryTable;
