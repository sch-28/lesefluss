import { BOOK_STATUS_LABELS, BOOK_STATUSES } from "@lesefluss/core";
import { BookOpen, FolderPlus, Layers, Star, Tag as TagIcon } from "lucide-react";
import type React from "react";
import { useRef } from "react";
import { ActionSheet } from "../../components/action-sheet";
import { CollectionPickerSheet } from "../../components/collections/collection-picker-sheet";
import { ConfirmDialog } from "../../components/confirm-dialog";
import BulkRatingSheet from "./bulk-rating-sheet";
import { bookCount, titleList } from "./bulk-summary";
import BulkTagSheet from "./bulk-tag-sheet";
import { type TagSheetMode, tagPatchFor } from "./bulk-tags";
import type { BulkSheet, UseLibrarySelection } from "./use-library-selection";

type Props = {
	selection: UseLibrarySelection;
	/** Tags already in use across the library, offered alongside the selection's. */
	libraryTags: string[];
};

/** Held through the close animation, so the title does not flip back to "Tags". */
function useLastTagMode(sheet: BulkSheet): TagSheetMode {
	const last = useRef<TagSheetMode>("edit");
	if (sheet === "tags") last.current = "edit";
	if (sheet === "add-tags") last.current = "add";
	if (sheet === "remove-tags") last.current = "remove";
	return last.current;
}

/** Held through the close animation, so a lone book's sheet does not flip to "0 books". */
function useHeldWhileClosed<T>(value: T, isOpen: boolean): T {
	const last = useRef(value);
	if (isOpen) last.current = value;
	return last.current;
}

/** Every overlay a bulk action can open: the menu, its pickers, the delete
 *  confirm, and the summary shown when something failed. */
const BulkSheets: React.FC<Props> = ({ selection, libraryTags }) => {
	// The delete confirm stays on `picked`: no shortcut deletes a lone book.
	const { picked } = selection;
	const isSheetOpen = selection.sheet !== null;
	const targets = useHeldWhileClosed(selection.targets, isSheetOpen);
	const targetsInView = useHeldWhileClosed(selection.targetsInView, isSheetOpen);
	const title = bookCount(targets.length);
	const tagMode = useLastTagMode(selection.sheet);
	const pickerKind = useHeldWhileClosed(
		selection.sheet === "series" ? "series" : "collection",
		selection.sheet === "series" || selection.sheet === "collection",
	);

	return (
		<>
			<ActionSheet
				open={selection.sheet === "actions"}
				onOpenChange={(open) => {
					if (!open) selection.closeSheet();
				}}
				title={title}
				items={[
					{
						label: "Set reading status",
						icon: BookOpen,
						// A submenu is impossible: ActionSheet closes on select.
						onSelect: () => selection.openSheet("status"),
					},
					{
						label: "Set rating",
						icon: Star,
						onSelect: () => selection.openSheet("rating"),
					},
					{
						label: "Edit tags",
						icon: TagIcon,
						onSelect: () => selection.openSheet("tags"),
					},
					{
						label: "Add to series…",
						icon: Layers,
						onSelect: () => selection.openSheet("series"),
					},
					{
						label: "Add to collection…",
						icon: FolderPlus,
						onSelect: () => selection.openSheet("collection"),
					},
					{
						label: "Delete",
						destructive: true,
						onSelect: () => selection.setDeleteOpen(true),
					},
				]}
			/>

			<ActionSheet
				open={selection.sheet === "status"}
				onOpenChange={(open) => {
					if (!open) selection.closeSheet();
				}}
				title={title}
				items={[
					...BOOK_STATUSES.map((status) => ({
						label: BOOK_STATUS_LABELS[status],
						onSelect: () => selection.run({ kind: "status", status }),
					})),
					{
						label: "Clear status",
						onSelect: () => selection.run({ kind: "status", status: null }),
					},
				]}
			/>

			<BulkRatingSheet
				isOpen={selection.sheet === "rating"}
				count={targets.length}
				onClose={selection.closeSheet}
				onApply={(rating) => selection.run({ kind: "rating", rating })}
			/>

			<CollectionPickerSheet
				books={targetsInView}
				kind={pickerKind}
				open={selection.sheet === "collection" || selection.sheet === "series"}
				onClose={selection.closeSheet}
			/>

			<BulkTagSheet
				isOpen={
					selection.sheet === "tags" ||
					selection.sheet === "add-tags" ||
					selection.sheet === "remove-tags"
				}
				picked={targets}
				mode={tagMode}
				libraryTags={libraryTags}
				onClose={selection.closeSheet}
				onApply={(intents) =>
					selection.run({ kind: "tags", patch: (book) => tagPatchFor(book, intents) })
				}
			/>

			<ConfirmDialog
				open={selection.isDeleteOpen}
				onOpenChange={selection.setDeleteOpen}
				title={picked.length === 1 ? "Delete book?" : `Delete ${bookCount(picked.length)}?`}
				// Named, not just counted. A selection survives a filter change, so
				// some of these may not be on screen; listing them is what makes the
				// confirm honest without a separate warning.
				description={
					picked.length === 1
						? `"${picked[0]?.title}" will be removed from your library.`
						: titleList(picked.map((book) => book.title))
				}
				confirmLabel="Delete"
				destructive
				onConfirm={() => selection.run({ kind: "delete" })}
			/>

			<ConfirmDialog
				open={selection.failure !== null}
				onOpenChange={(open) => {
					if (!open) selection.dismissFailure();
				}}
				title={selection.failure?.headline ?? ""}
				description={selection.failure?.detail}
				variant="info"
			/>
		</>
	);
};

export default BulkSheets;
