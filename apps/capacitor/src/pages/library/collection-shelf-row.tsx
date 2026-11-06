import { cn } from "@lesefluss/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { CollectionActions } from "../../components/collections/collection-actions";
import { CollectionNameDialog } from "../../components/collections/collection-name-dialog";
import { queryHooks } from "../../services/db/hooks";
import type { CollectionWithCount } from "../../services/db/queries/collections";
import { useLongPress } from "./use-long-press";

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

/** The phone's collection switcher; the desktop sidebar lists the same collections. */
const CollectionShelfRow: React.FC<{ activeId: string | undefined }> = ({ activeId }) => {
	const { data: collections = [] } = queryHooks.useCollections();
	const create = queryHooks.useCreateCollection();
	const navigate = useNavigate();
	const [menuFor, setMenuFor] = useState<CollectionWithCount | null>(null);
	const [creating, setCreating] = useState(false);

	const open = (id: string | undefined) =>
		navigate({ to: "/tabs/library", search: id ? { collection: id } : {} });

	return (
		<div className="md:hidden">
			<div
				role="toolbar"
				aria-label="Collections"
				className="flex gap-2 overflow-x-auto px-4 py-2 [scrollbar-width:none]"
			>
				<button
					type="button"
					aria-pressed={!activeId}
					onClick={() => open(undefined)}
					className={cn(
						CHIP,
						!activeId
							? "border-primary bg-primary text-primary-foreground"
							: "border-border bg-card text-foreground",
					)}
				>
					All
				</button>
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
					onClick={() => setCreating(true)}
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
			<CollectionNameDialog
				open={creating}
				onOpenChange={setCreating}
				title="New collection"
				confirmLabel="Create"
				onSubmit={(name) => create.mutate(name, { onSuccess: (row) => open(row.id) })}
			/>
		</div>
	);
};

export default CollectionShelfRow;
