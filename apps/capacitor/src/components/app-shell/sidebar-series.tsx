import { cn } from "@lesefluss/ui/utils";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Layers, MoreHorizontal, Plus, ScrollText } from "lucide-react";
import type React from "react";
import { useState } from "react";
import {
	type SeriesEntry,
	SIDEBAR_SERIES_LIMIT,
	seriesEntryKey,
} from "../../pages/library/series-nav";
import {
	ALL_SERIES_PATH,
	useActiveSeriesKey,
	useSeriesEntries,
} from "../../pages/library/use-series-nav";
import { queryHooks } from "../../services/db/hooks";
import { collectionKeys } from "../../services/db/hooks/query-keys";
import { queries } from "../../services/db/queries";
import type { CollectionWithCount } from "../../services/db/queries/collections";
import { CollectionActions } from "../collections/collection-actions";
import { BOOKS_DRAG_TYPE, carries, readBooksDragData } from "../collections/drag-data";
import { planSeriesNumbers } from "../collections/series-numbering";
import { toast } from "../toast";
import { useActiveRowInView } from "./use-active-row-in-view";

const ROW =
	"relative flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-5 text-sidebar-foreground/70 text-sm no-underline hover:text-sidebar-foreground data-[active=true]:text-primary data-[active=true]:before:absolute data-[active=true]:before:top-1 data-[active=true]:before:bottom-1 data-[active=true]:before:left-0 data-[active=true]:before:w-1 data-[active=true]:before:bg-primary";

const SERIES_ICON = "size-3.5 shrink-0 text-sidebar-foreground/50";

const COUNT = "shrink-0 text-sidebar-foreground/50 text-xs tabular-nums";

// A row without a menu button pads its count into the column of the rows that have one.
const NO_MENU_PAD = "pr-9";

const MENU_BUTTON =
	"mr-2 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground";

export function SidebarSeries({ isCollapsed }: { isCollapsed: boolean }) {
	const { entries } = useSeriesEntries();
	const activeKey = useActiveSeriesKey();
	const listRef = useActiveRowInView(activeKey, entries.length);
	const navigate = useNavigate();
	const qc = useQueryClient();
	const addNumbered = queryHooks.useAddNumberedBooks();
	const [dropId, setDropId] = useState<string | null>(null);
	const { data: collections = [] } = queryHooks.useCollections();
	const [menuFor, setMenuFor] = useState<CollectionWithCount | null>(null);
	// A serial has no edit page and one destructive action, so only book series get the menu.
	const menuCollection = (entry: SeriesEntry) =>
		entry.kind === "book" ? collections.find((c) => c.id === entry.id) : undefined;

	const takesBooks = (e: React.DragEvent, entry: SeriesEntry) =>
		entry.kind === "book" && carries(e.dataTransfer, BOOKS_DRAG_TYPE);

	// Dropped books join after the series' highest number; members keep theirs.
	const dropBooks = async (bookIds: string[], entry: SeriesEntry) => {
		const rows = await qc.fetchQuery({
			queryKey: collectionKeys.memberRows(entry.id),
			queryFn: () => queries.getCollectionMembers(entry.id),
		});
		const members = new Map(rows.map((r) => [r.bookId, r.seriesIndex]));
		addNumbered.mutate(
			{
				target: { collectionId: entry.id },
				numbers: planSeriesNumbers(bookIds, members, "append"),
			},
			{
				onSuccess: () =>
					toast.success(
						`Added ${bookIds.length === 1 ? "1 book" : `${bookIds.length} books`} to ${entry.name}`,
					),
			},
		);
	};

	if (isCollapsed) {
		if (entries.length === 0) return null;
		return (
			<button
				type="button"
				onClick={() => navigate({ to: ALL_SERIES_PATH })}
				title="All series"
				aria-label="All series"
				className="flex w-16 shrink-0 items-center justify-center py-2 text-sidebar-foreground/70 hover:text-sidebar-foreground"
			>
				<Layers className="size-5" />
			</button>
		);
	}

	const shown = entries.slice(0, SIDEBAR_SERIES_LIMIT);
	const activeHidden =
		activeKey !== undefined &&
		activeKey !== "all" &&
		entries.some((e) => seriesEntryKey(e) === activeKey) &&
		!shown.some((e) => seriesEntryKey(e) === activeKey);

	return (
		<section aria-label="Series" className="mt-4 short:mt-2 flex min-h-8 flex-col">
			<div className="flex shrink-0 items-center justify-between py-1 pr-3 pl-5">
				<h2 className="m-0 font-medium text-sidebar-foreground/60 text-xs">Series</h2>
				<button
					type="button"
					onClick={() =>
						navigate({ to: "/tabs/library/collections/new", search: { series: true } })
					}
					aria-label="New series"
					title="New series"
					className="inline-flex size-6 items-center justify-center rounded-md text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
				>
					<Plus className="size-4" />
				</button>
			</div>
			<ul ref={listRef} className="m-0 min-h-0 list-none overflow-y-auto overflow-x-hidden p-0">
				{shown.map((e) => {
					const collection = menuCollection(e);
					return (
						<li
							key={seriesEntryKey(e)}
							data-testid="sidebar-series"
							onContextMenu={(ev) => {
								if (!collection) return;
								ev.preventDefault();
								setMenuFor(collection);
							}}
							onDragOver={(ev) => {
								if (!takesBooks(ev, e)) return;
								ev.preventDefault();
								ev.dataTransfer.dropEffect = "copy";
								if (dropId !== e.id) setDropId(e.id);
							}}
							onDragLeave={(ev) => {
								if (!ev.currentTarget.contains(ev.relatedTarget as Node | null)) setDropId(null);
							}}
							onDrop={(ev) => {
								setDropId(null);
								if (!takesBooks(ev, e)) return;
								ev.preventDefault();
								const bookIds = readBooksDragData(ev.dataTransfer);
								if (bookIds.length > 0) void dropBooks(bookIds, e);
							}}
							className={cn(
								"flex items-center",
								dropId === e.id && "bg-primary/10 ring-1 ring-primary ring-inset",
							)}
						>
							<Link
								{...(e.kind === "serial"
									? { to: "/tabs/library/series/$id", params: { id: e.id } }
									: { to: "/tabs/library", search: { collection: e.id } })}
								data-active={activeKey === seriesEntryKey(e)}
								className={cn(ROW, collection ? "pr-1" : NO_MENU_PAD)}
							>
								{e.kind === "serial" ? (
									<ScrollText aria-hidden className={SERIES_ICON} />
								) : (
									<Layers aria-hidden className={SERIES_ICON} />
								)}
								<span className="min-w-0 flex-1 truncate">{e.name}</span>
								<span className={COUNT}>{e.count}</span>
							</Link>
							{collection && (
								<button
									type="button"
									onClick={() => setMenuFor(collection)}
									aria-label={`${e.name} options`}
									className={MENU_BUTTON}
								>
									<MoreHorizontal className="size-4" />
								</button>
							)}
						</li>
					);
				})}
				{/* Not only past the limit: All series is where search and sort live. */}
				{entries.length > 0 && (
					<li className="flex">
						<Link
							to={ALL_SERIES_PATH}
							data-active={activeKey === "all" || activeHidden}
							className={cn(ROW, NO_MENU_PAD)}
						>
							<span className="min-w-0 flex-1 truncate">All series</span>
							<span className={COUNT}>{entries.length}</span>
						</Link>
					</li>
				)}
			</ul>
			<CollectionActions
				collection={menuFor}
				collections={menuFor ? [menuFor] : []}
				allCollections={collections}
				onClose={() => setMenuFor(null)}
			/>
		</section>
	);
}
