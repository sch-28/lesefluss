import { useLocation, useNavigate } from "@tanstack/react-router";
import { Pencil, Pin, PinOff, RotateCcw, SlidersHorizontal, Trash2 } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { encodeFilterParam } from "../../pages/library/filter-model";
import { ShelfConditionEditor } from "../../pages/library/shelf-condition-editor";
import { clearLibraryFilter } from "../../pages/library/use-library-filter";
import type { ShelfEntry } from "../../pages/library/use-smart-shelves";
import { queryHooks } from "../../services/db/hooks";
import { ActionSheet, type ActionSheetItem } from "../action-sheet";
import { ConfirmDialog } from "../confirm-dialog";
import { ShelfNameDialog } from "./shelf-name-dialog";

type Props = {
	/** The shelf whose menu is open; null closes it. */
	shelf: ShelfEntry | null;
	onClose: () => void;
	setBuiltInPinned: (id: string, pinned: boolean) => void;
};

export function openShelf(navigate: ReturnType<typeof useNavigate>, shelf: ShelfEntry) {
	return navigate({
		to: "/tabs/library",
		search: { shelf: shelf.id, f: shelf.filter ? encodeFilterParam(shelf.filter) : undefined },
	});
}

/** Built-ins only pin; a user shelf also renames, edits, resets its view and deletes, and those changes sync. */
export const ShelfActions: React.FC<Props> = ({ shelf, onClose, setBuiltInPinned }) => {
	const [renaming, setRenaming] = useState<ShelfEntry | null>(null);
	const [deleting, setDeleting] = useState<ShelfEntry | null>(null);
	// Kept past close, so the editor does not change under its closing animation.
	const [editing, setEditing] = useState<ShelfEntry | null>(null);
	const [isEditing, setIsEditing] = useState(false);
	const update = queryHooks.useUpdateSmartShelf();
	const remove = queryHooks.useDeleteSmartShelf();
	const navigate = useNavigate();
	const location = useLocation();

	const togglePin = () => {
		if (!shelf) return;
		if (shelf.isBuiltIn) setBuiltInPinned(shelf.id, !shelf.pinned);
		else update.mutate({ id: shelf.id, pinned: !shelf.pinned });
	};

	const pinItem: ActionSheetItem = {
		label: shelf?.pinned ? "Unpin" : "Pin",
		icon: shelf?.pinned ? PinOff : Pin,
		onSelect: togglePin,
	};
	const items: ActionSheetItem[] = shelf?.isBuiltIn
		? [pinItem]
		: [
				{ label: "Rename", icon: Pencil, onSelect: () => setRenaming(shelf) },
				{
					label: "Edit conditions…",
					icon: SlidersHorizontal,
					// Conditions this version cannot read would be overwritten, not edited.
					disabled: !shelf?.tree,
					onSelect: () => {
						setEditing(shelf);
						setIsEditing(true);
					},
				},
				...(shelf?.view
					? [
							{
								label: "Reset view",
								icon: RotateCcw,
								onSelect: () => update.mutate({ id: shelf.id, view: null }),
							},
						]
					: []),
				pinItem,
				{
					label: "Delete shelf…",
					icon: Trash2,
					destructive: true,
					onSelect: () => setDeleting(shelf),
				},
			];

	const confirmDelete = () => {
		if (!deleting) return;
		const id = deleting.id;
		setDeleting(null);
		const open = (location.search as { shelf?: string }).shelf;
		const isViewing = location.pathname === "/tabs/library" && open === id;
		if (isViewing) clearLibraryFilter();
		remove.mutate(id);
		if (isViewing) navigate({ to: "/tabs/library", search: {} });
	};

	return (
		<>
			<ActionSheet
				open={!!shelf}
				onOpenChange={(open) => {
					if (!open) onClose();
				}}
				title={shelf?.name}
				items={items}
			/>
			<ShelfNameDialog
				open={!!renaming}
				onOpenChange={(open) => {
					if (!open) setRenaming(null);
				}}
				title="Rename shelf"
				confirmLabel="Rename"
				initialName={renaming?.name}
				onSubmit={(name) => {
					if (renaming) update.mutate({ id: renaming.id, name });
				}}
			/>
			<ShelfConditionEditor open={isEditing} onOpenChange={setIsEditing} shelf={editing} />
			<ConfirmDialog
				open={!!deleting}
				onOpenChange={(open) => {
					if (!open) setDeleting(null);
				}}
				title="Delete shelf?"
				description={
					deleting
						? `"${deleting.name}" will be deleted. Its books stay in your library.`
						: undefined
				}
				confirmLabel="Delete"
				destructive
				onConfirm={confirmDelete}
			/>
		</>
	);
};
