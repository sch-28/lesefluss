import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@lesefluss/ui/drawer";
import { CHIP_BASE, FilterChip } from "@lesefluss/ui/filter-chip";
import { cn } from "@lesefluss/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { Layers, type LucideIcon, MoreHorizontal, Plus, ScrollText } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { CollectionActions } from "../../components/collections/collection-actions";
import { openShelf, ShelfActions } from "../../components/smart-shelves/shelf-actions";
import { queryHooks } from "../../services/db/hooks";
import type { CollectionWithCount } from "../../services/db/queries/collections";
import { type SeriesEntry, seriesEntryKey } from "./series-nav";
import { useLongPress } from "./use-long-press";
import { useActiveSeriesKey, useOpenSeries, useSeriesEntries } from "./use-series-nav";
import { type ShelfEntry, useSmartShelves } from "./use-smart-shelves";

/** Chips shown in the row before the rest goes to the More sheet; the open one always shows. */
export const INLINE_CHIP_LIMIT = 10;

type ChipProps = {
	name: string;
	count: number;
	icon?: LucideIcon;
	testId: string;
	active: boolean;
	onOpen: () => void;
	/** Right-click and long press; a chip without one only opens. */
	onMenu?: () => void;
};

const CollectionChip: React.FC<ChipProps> = ({
	name,
	count,
	icon: Icon,
	testId,
	active,
	onOpen,
	onMenu,
}) => {
	const handlers = useLongPress({ onTap: onOpen, onMenu: onMenu ?? (() => {}), enabled: !!onMenu });
	return (
		<FilterChip {...handlers} selected={active} count={count} data-testid={testId}>
			{Icon && <Icon aria-hidden className="size-3.5 shrink-0 opacity-70" />}
			<span className="max-w-[12rem] truncate">{name}</span>
		</FilterChip>
	);
};

const SmartShelfChip: React.FC<{
	shelf: ShelfEntry;
	count: number;
	active: boolean;
	onOpen: () => void;
	onMenu: () => void;
}> = ({ shelf, count, active, onOpen, onMenu }) => {
	const handlers = useLongPress({ onTap: onOpen, onMenu });
	return (
		<FilterChip
			{...handlers}
			selected={active}
			count={count}
			data-testid="shelf-smart"
			className={cn(!active && "border border-muted-foreground/40 border-dashed")}
		>
			<span className="max-w-[12rem] truncate">{shelf.name}</span>
		</FilterChip>
	);
};

type RowChip =
	| { kind: "shelf"; key: string; shelf: ShelfEntry; count: number; active: boolean }
	| { kind: "collection"; key: string; collection: CollectionWithCount; active: boolean }
	| {
			kind: "series";
			key: string;
			entry: SeriesEntry;
			collection: CollectionWithCount | undefined;
			active: boolean;
	  };

/** The chips the row shows and the ones the More sheet takes, the open chip kept in the row. */
export function splitChips<T extends { active: boolean }>(
	chips: readonly T[],
	limit = INLINE_CHIP_LIMIT,
): { inline: T[]; more: T[] } {
	const inline = chips.slice(0, limit);
	const more = chips.slice(limit);
	const activeIndex = more.findIndex((c) => c.active);
	if (activeIndex >= 0) inline.push(...more.splice(activeIndex, 1));
	return { inline, more };
}

const chipName = (c: RowChip) =>
	c.kind === "shelf" ? c.shelf.name : c.kind === "collection" ? c.collection.name : c.entry.name;

const SERIES_ICON: Record<SeriesEntry["kind"], LucideIcon> = { book: Layers, serial: ScrollText };

/** Book series in their collection order, so the chip menu's reorder moves what the row shows; serials follow. */
export function inShelfOrder(
	entries: readonly SeriesEntry[],
	seriesCollections: readonly { id: string }[],
): SeriesEntry[] {
	const rank = new Map(seriesCollections.map((c, i) => [c.id, i]));
	const books = entries.filter((e) => e.kind === "book");
	books.sort(
		(a, b) =>
			(rank.get(a.id) ?? Number.POSITIVE_INFINITY) - (rank.get(b.id) ?? Number.POSITIVE_INFINITY),
	);
	return [...books, ...entries.filter((e) => e.kind !== "book")];
}

/**
 * The phone's one shelf row: smart shelves, collections and series (decision
 * ded80b12 on LESE-185); the desktop sidebar lists the same.
 */
const CollectionShelfRow: React.FC<{
	activeId: string | undefined;
	activeShelfId: string | undefined;
}> = ({ activeId, activeShelfId }) => {
	const { data: allCollections = [] } = queryHooks.useCollections();
	const collections = allCollections.filter((c) => c.seriesKey === null);
	const seriesCollections = allCollections.filter((c) => c.seriesKey !== null);
	const smart = useSmartShelves();
	const { entries: seriesEntries } = useSeriesEntries();
	const series = inShelfOrder(seriesEntries, seriesCollections);
	const shownSeries = series.flatMap((entry) =>
		entry.kind === "book" ? seriesCollections.filter((c) => c.id === entry.id) : [],
	);
	const activeSeriesKey = useActiveSeriesKey();
	const openSeries = useOpenSeries();
	const [shelfMenuFor, setShelfMenuFor] = useState<ShelfEntry | null>(null);
	const navigate = useNavigate();
	const [menuFor, setMenuFor] = useState<CollectionWithCount | null>(null);
	const [isMoreOpen, setIsMoreOpen] = useState(false);

	const open = (id: string | undefined) =>
		navigate({ to: "/tabs/library", search: id ? { collection: id } : {} });

	const chips: RowChip[] = [
		...smart.shelves.map(
			(shelf): RowChip => ({
				kind: "shelf",
				key: `shelf:${shelf.id}`,
				shelf,
				count: smart.counts.get(shelf.id) ?? 0,
				active: activeShelfId === shelf.id,
			}),
		),
		...collections.map(
			(collection): RowChip => ({
				kind: "collection",
				key: `collection:${collection.id}`,
				collection,
				active: activeId === collection.id,
			}),
		),
		...series.map(
			(entry): RowChip => ({
				kind: "series",
				key: seriesEntryKey(entry),
				entry,
				collection:
					entry.kind === "book" ? seriesCollections.find((c) => c.id === entry.id) : undefined,
				active: activeSeriesKey === seriesEntryKey(entry),
			}),
		),
	];
	const { inline, more } = splitChips(chips);
	const countOf = (c: RowChip) =>
		c.kind === "shelf" ? c.count : c.kind === "collection" ? c.collection.bookCount : c.entry.count;

	const openChip = (c: RowChip) => {
		setIsMoreOpen(false);
		if (c.kind === "shelf") openShelf(navigate, c.shelf);
		else if (c.kind === "collection") open(c.collection.id);
		else openSeries(c.entry);
	};

	const menuOf = (c: RowChip): (() => void) | undefined => {
		if (c.kind === "shelf") return () => setShelfMenuFor(c.shelf);
		const collection = c.collection;
		return collection ? () => setMenuFor(collection) : undefined;
	};

	const menuSiblings = menuFor?.seriesKey != null ? shownSeries : collections;

	return (
		<div className="md:hidden">
			<div
				role="toolbar"
				aria-label="Collections and shelves"
				className="flex gap-2 overflow-x-auto px-4 py-2 [scrollbar-width:none]"
			>
				<FilterChip selected={!activeId && !activeShelfId} onClick={() => open(undefined)}>
					All
				</FilterChip>
				{inline.map((c) =>
					c.kind === "shelf" ? (
						<SmartShelfChip
							key={c.key}
							shelf={c.shelf}
							count={c.count}
							active={c.active}
							onOpen={() => openChip(c)}
							onMenu={() => setShelfMenuFor(c.shelf)}
						/>
					) : (
						<CollectionChip
							key={c.key}
							name={chipName(c)}
							count={countOf(c)}
							icon={c.kind === "series" ? SERIES_ICON[c.entry.kind] : undefined}
							testId={c.kind === "series" ? "shelf-series" : "shelf-collection"}
							active={c.active}
							onOpen={() => openChip(c)}
							onMenu={menuOf(c)}
						/>
					),
				)}
				<button
					type="button"
					onClick={() => setIsMoreOpen(true)}
					aria-label={more.length > 0 ? `More, ${more.length} more` : "More"}
					className={cn(CHIP_BASE, "text-muted-foreground")}
				>
					<MoreHorizontal aria-hidden className="size-4" />
					{more.length > 0 && <span className="text-xs tabular-nums">{more.length}</span>}
				</button>
			</div>
			<Drawer open={isMoreOpen} onOpenChange={setIsMoreOpen}>
				<DrawerContent data-testid="shelf-more-sheet">
					<DrawerHeader>
						<DrawerTitle>Shelves</DrawerTitle>
					</DrawerHeader>
					<div className="flex max-h-[60vh] flex-col overflow-y-auto p-2">
						{more.map((c) => {
							const Icon = c.kind === "series" ? SERIES_ICON[c.entry.kind] : undefined;
							return (
								<button
									key={c.key}
									type="button"
									onClick={() => openChip(c)}
									className="flex h-12 w-full items-center gap-3 rounded-md px-3 text-left text-base hover:bg-muted"
								>
									{Icon && <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />}
									<span className="min-w-0 flex-1 truncate">{chipName(c)}</span>
									<span className="text-muted-foreground text-sm tabular-nums">{countOf(c)}</span>
								</button>
							);
						})}
						<button
							type="button"
							onClick={() => {
								setIsMoreOpen(false);
								navigate({ to: "/tabs/library/collections/new" });
							}}
							className="flex h-12 w-full items-center gap-3 rounded-md px-3 text-left text-base text-muted-foreground hover:bg-muted"
						>
							<Plus aria-hidden className="size-4 shrink-0" />
							New collection
						</button>
					</div>
				</DrawerContent>
			</Drawer>
			<CollectionActions
				collection={menuFor}
				collections={menuSiblings}
				allCollections={allCollections}
				onClose={() => setMenuFor(null)}
			/>
			<ShelfActions
				shelf={shelfMenuFor}
				onClose={() => setShelfMenuFor(null)}
				setBuiltInPinned={smart.setBuiltInPinned}
			/>
		</div>
	);
};

export default CollectionShelfRow;
