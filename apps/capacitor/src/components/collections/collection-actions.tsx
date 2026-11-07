import { useLocation, useNavigate } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Pencil, Trash2 } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { queryHooks } from "../../services/db/hooks";
import type { CollectionWithCount } from "../../services/db/queries/collections";
import { ActionSheet } from "../action-sheet";
import { ConfirmDialog } from "../confirm-dialog";

type Props = {
	/** The collection whose menu is open; null closes it. */
	collection: CollectionWithCount | null;
	/** The list the user sees and reorders within. */
	collections: CollectionWithCount[];
	/** Every collection, when `collections` hides some (series): moves index into this one. */
	allCollections?: CollectionWithCount[];
	onClose: () => void;
};

/** The `moveCollection` index that puts `id` right before or after `neighborId` in `all`. */
export function indexBeside(
	all: readonly CollectionWithCount[],
	id: string,
	neighborId: string,
	side: "before" | "after",
): number {
	const at = all.filter((c) => c.id !== id).findIndex((c) => c.id === neighborId);
	return side === "before" ? at : at + 1;
}

/** Edit, reorder and delete for one collection, shared by the sidebar and the phone shelf row. */
export const CollectionActions: React.FC<Props> = ({
	collection,
	collections,
	allCollections = collections,
	onClose,
}) => {
	const [deleting, setDeleting] = useState<CollectionWithCount | null>(null);
	const move = queryHooks.useMoveCollection();
	const remove = queryHooks.useDeleteCollection();
	const navigate = useNavigate();
	const location = useLocation();

	const index = collection ? collections.findIndex((c) => c.id === collection.id) : -1;
	const noun = (collection ?? deleting)?.seriesKey ? "series" : "collection";

	const confirmDelete = () => {
		if (!deleting) return;
		const id = deleting.id;
		setDeleting(null);
		remove.mutate(id);
		const open = (location.search as { collection?: string }).collection;
		if (location.pathname === "/tabs/library" && open === id) {
			navigate({ to: "/tabs/library", search: {} });
		}
	};

	return (
		<>
			<ActionSheet
				open={!!collection}
				onOpenChange={(open) => {
					if (!open) onClose();
				}}
				title={collection?.name}
				items={[
					{
						label: `Edit ${noun}`,
						icon: Pencil,
						onSelect: () => {
							if (collection) {
								navigate({
									to: "/tabs/library/collections/$id/edit",
									params: { id: collection.id },
								});
							}
						},
					},
					{
						label: "Move up",
						icon: ArrowUp,
						disabled: index <= 0,
						onSelect: () => {
							const above = collections[index - 1];
							if (collection && above) {
								move.mutate({
									id: collection.id,
									toIndex: indexBeside(allCollections, collection.id, above.id, "before"),
								});
							}
						},
					},
					{
						label: "Move down",
						icon: ArrowDown,
						disabled: index < 0 || index >= collections.length - 1,
						onSelect: () => {
							const below = collections[index + 1];
							if (collection && below) {
								move.mutate({
									id: collection.id,
									toIndex: indexBeside(allCollections, collection.id, below.id, "after"),
								});
							}
						},
					},
					{
						label: `Delete ${noun}`,
						icon: Trash2,
						destructive: true,
						onSelect: () => setDeleting(collection),
					},
				]}
			/>
			<ConfirmDialog
				open={!!deleting}
				onOpenChange={(open) => {
					if (!open) setDeleting(null);
				}}
				title={`Delete ${noun}?`}
				description={
					deleting
						? deleting.seriesKey
							? `"${deleting.name}" will be deleted, and new imports will not bring it back. Its books stay in your library.`
							: `"${deleting.name}" will be deleted. Its books stay in your library.`
						: undefined
				}
				confirmLabel="Delete"
				destructive
				onConfirm={confirmDelete}
			/>
		</>
	);
};
