import { cn } from "@lesefluss/ui/utils";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Library, MoreHorizontal, Plus } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { queryHooks } from "../../services/db/hooks";
import type { CollectionWithCount } from "../../services/db/queries/collections";
import { CollectionActions, indexBeside } from "../collections/collection-actions";
import {
	BOOKS_DRAG_TYPE,
	COLLECTION_DRAG_TYPE,
	carries,
	readBooksDragData,
} from "../collections/drag-data";
import { toast } from "../toast";

type Props = {
	isCollapsed: boolean;
	onExpand: () => void;
};

type DropHint = { id: string; kind: "books" | "before" | "after" };

export function SidebarCollections({ isCollapsed, onExpand }: Props) {
	const { data: allCollections = [] } = queryHooks.useCollections();
	const collections = allCollections.filter((c) => c.seriesKey === null);
	const move = queryHooks.useMoveCollection();
	const addBooks = queryHooks.useAddBooksToCollection();
	const navigate = useNavigate();
	const location = useLocation();
	const [menuFor, setMenuFor] = useState<CollectionWithCount | null>(null);
	const [dropHint, setDropHint] = useState<DropHint | null>(null);
	const [draggingId, setDraggingId] = useState<string | null>(null);

	const newCollection = () => navigate({ to: "/tabs/library/collections/new" });

	const activeId =
		location.pathname === "/tabs/library"
			? (location.search as { collection?: string }).collection
			: undefined;

	if (isCollapsed) {
		return (
			<button
				type="button"
				onClick={onExpand}
				title="Collections"
				aria-label="Show collections"
				className="flex w-16 shrink-0 items-center justify-center py-2.5 text-sidebar-foreground/70 hover:text-sidebar-foreground"
			>
				<Library className="size-5" />
			</button>
		);
	}

	const hintFor = (e: React.DragEvent, c: CollectionWithCount): DropHint | null => {
		if (carries(e.dataTransfer, BOOKS_DRAG_TYPE)) return { id: c.id, kind: "books" };
		if (carries(e.dataTransfer, COLLECTION_DRAG_TYPE) && draggingId && draggingId !== c.id) {
			const rect = e.currentTarget.getBoundingClientRect();
			return { id: c.id, kind: e.clientY < rect.top + rect.height / 2 ? "before" : "after" };
		}
		return null;
	};

	const handleDrop = (e: React.DragEvent, c: CollectionWithCount) => {
		const hint = hintFor(e, c);
		setDropHint(null);
		if (!hint) return;
		e.preventDefault();
		if (hint.kind === "books") {
			const bookIds = readBooksDragData(e.dataTransfer);
			if (bookIds.length === 0) return;
			addBooks.mutate(
				{ collectionId: c.id, bookIds },
				{
					onSuccess: () =>
						toast.success(
							`Added ${bookIds.length === 1 ? "1 book" : `${bookIds.length} books`} to ${c.name}`,
						),
				},
			);
			return;
		}
		if (!draggingId) return;
		move.mutate({
			id: draggingId,
			toIndex: indexBeside(allCollections, draggingId, c.id, hint.kind),
		});
	};

	return (
		<section aria-label="Collections" className="mt-4 flex shrink-0 flex-col">
			<div className="flex items-center justify-between py-1 pr-3 pl-5">
				<h2 className="m-0 font-semibold text-sidebar-foreground/60 text-xs uppercase tracking-wide">
					Collections
				</h2>
				<button
					type="button"
					onClick={newCollection}
					aria-label="New collection"
					title="New collection"
					className="inline-flex size-6 items-center justify-center rounded-md text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
				>
					<Plus className="size-4" />
				</button>
			</div>
			<ul className="m-0 max-h-64 list-none overflow-y-auto p-0">
				{collections.map((c) => {
					const hint = dropHint?.id === c.id ? dropHint.kind : null;
					return (
						<li
							key={c.id}
							draggable
							onDragStart={(e) => {
								e.dataTransfer.setData(COLLECTION_DRAG_TYPE, c.id);
								e.dataTransfer.effectAllowed = "move";
								setDraggingId(c.id);
							}}
							onDragEnd={() => {
								setDraggingId(null);
								setDropHint(null);
							}}
							onDragOver={(e) => {
								const next = hintFor(e, c);
								if (!next) return;
								e.preventDefault();
								e.dataTransfer.dropEffect = next.kind === "books" ? "copy" : "move";
								if (next.id !== dropHint?.id || next.kind !== dropHint.kind) setDropHint(next);
							}}
							onDragLeave={(e) => {
								if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropHint(null);
							}}
							onDrop={(e) => handleDrop(e, c)}
							onContextMenu={(e) => {
								e.preventDefault();
								setMenuFor(c);
							}}
							data-testid="sidebar-collection"
							className={cn(
								"group relative flex items-center",
								hint === "books" && "bg-primary/10 ring-1 ring-primary ring-inset",
								hint === "before" && "shadow-[inset_0_2px_0_0_var(--color-primary)]",
								hint === "after" && "shadow-[inset_0_-2px_0_0_var(--color-primary)]",
								draggingId === c.id && "opacity-50",
							)}
						>
							<Link
								to="/tabs/library"
								search={{ collection: c.id }}
								draggable={false}
								data-active={activeId === c.id}
								className="relative flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-1 pl-5 text-sidebar-foreground/70 text-sm no-underline hover:text-sidebar-foreground data-[active=true]:text-primary data-[active=true]:before:absolute data-[active=true]:before:top-1 data-[active=true]:before:bottom-1 data-[active=true]:before:left-0 data-[active=true]:before:w-1 data-[active=true]:before:bg-primary"
							>
								<span className="min-w-0 flex-1 truncate">{c.name}</span>
								<span className="shrink-0 text-sidebar-foreground/50 text-xs tabular-nums group-hover:hidden">
									{c.bookCount}
								</span>
							</Link>
							<button
								type="button"
								onClick={() => setMenuFor(c)}
								aria-label={`${c.name} options`}
								className="mr-2 hidden size-6 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:inline-flex group-hover:inline-flex"
							>
								<MoreHorizontal className="size-4" />
							</button>
						</li>
					);
				})}
				<li>
					<button
						type="button"
						onClick={newCollection}
						className="flex w-full items-center gap-2 py-1.5 pl-5 text-left text-sidebar-foreground/50 text-sm hover:text-sidebar-foreground"
					>
						<Plus className="size-4" />
						New collection
					</button>
				</li>
			</ul>
			<CollectionActions
				collection={menuFor}
				collections={collections}
				allCollections={allCollections}
				onClose={() => setMenuFor(null)}
			/>
		</section>
	);
}
