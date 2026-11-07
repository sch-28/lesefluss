import { cn } from "@lesefluss/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { CollectionActions } from "../../components/collections/collection-actions";
import { openShelf, ShelfActions } from "../../components/smart-shelves/shelf-actions";
import { queryHooks } from "../../services/db/hooks";
import type { CollectionWithCount } from "../../services/db/queries/collections";
import { useLongPress } from "./use-long-press";
import { type ShelfEntry, useSmartShelves } from "./use-smart-shelves";

const CHIP =
	"inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-sm whitespace-nowrap transition-colors";

type ChipProps = {
	collection: CollectionWithCount;
	active: boolean;
	onOpen: () => void;
	onMenu: () => void;
};

const CollectionChip: React.FC<ChipProps> = ({ collection, active, onOpen, onMenu }) => {
	const handlers = useLongPress({ onTap: onOpen, onMenu });
	return (
		<button
			type="button"
			{...handlers}
			aria-pressed={active}
			data-testid="shelf-collection"
			className={cn(
				CHIP,
				active
					? "border-primary bg-primary text-primary-foreground"
					: "border-border bg-card text-foreground",
			)}
		>
			<span className="max-w-[12rem] truncate">{collection.name}</span>
			<span className={cn("text-xs tabular-nums", active ? "opacity-80" : "text-muted-foreground")}>
				{collection.bookCount}
			</span>
		</button>
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
		<button
			type="button"
			{...handlers}
			aria-pressed={active}
			data-testid="shelf-smart"
			className={cn(
				CHIP,
				active
					? "border-primary bg-primary text-primary-foreground"
					: "border-border border-dashed bg-card text-foreground",
			)}
		>
			<span className="max-w-[12rem] truncate">{shelf.name}</span>
			<span className={cn("text-xs tabular-nums", active ? "opacity-80" : "text-muted-foreground")}>
				{count}
			</span>
		</button>
	);
};

/** The phone's collection and smart shelf switcher; the desktop sidebar lists the same. */
const CollectionShelfRow: React.FC<{
	activeId: string | undefined;
	activeShelfId: string | undefined;
}> = ({ activeId, activeShelfId }) => {
	const { data: collections = [] } = queryHooks.useCollections();
	const smart = useSmartShelves();
	const [shelfMenuFor, setShelfMenuFor] = useState<ShelfEntry | null>(null);
	const navigate = useNavigate();
	const [menuFor, setMenuFor] = useState<CollectionWithCount | null>(null);

	const open = (id: string | undefined) =>
		navigate({ to: "/tabs/library", search: id ? { collection: id } : {} });

	return (
		<div className="md:hidden">
			<div
				role="toolbar"
				aria-label="Collections and shelves"
				className="flex gap-2 overflow-x-auto px-4 py-2 [scrollbar-width:none]"
			>
				<button
					type="button"
					aria-pressed={!activeId && !activeShelfId}
					onClick={() => open(undefined)}
					className={cn(
						CHIP,
						!activeId && !activeShelfId
							? "border-primary bg-primary text-primary-foreground"
							: "border-border bg-card text-foreground",
					)}
				>
					All
				</button>
				{smart.shelves.map((s) => (
					<SmartShelfChip
						key={s.id}
						shelf={s}
						count={smart.counts.get(s.id) ?? 0}
						active={activeShelfId === s.id}
						onOpen={() => openShelf(navigate, s)}
						onMenu={() => setShelfMenuFor(s)}
					/>
				))}
				{collections.map((c) => (
					<CollectionChip
						key={c.id}
						collection={c}
						active={activeId === c.id}
						onOpen={() => open(c.id)}
						onMenu={() => setMenuFor(c)}
					/>
				))}
				<button
					type="button"
					onClick={() => navigate({ to: "/tabs/library/collections/new" })}
					aria-label="New collection"
					className={cn(CHIP, "border-border border-dashed text-muted-foreground")}
				>
					<Plus className="size-4" />
					{collections.length === 0 && "New collection"}
				</button>
			</div>
			<CollectionActions
				collection={menuFor}
				collections={collections}
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
