import { BOOK_STATUS_LABELS, BOOK_STATUSES } from "@lesefluss/core";
import { BookOpen, FolderPlus, Star, Tag as TagIcon } from "lucide-react";
import type React from "react";
import { ActionSheet } from "../../components/action-sheet";
import { CollectionPickerSheet } from "../../components/collections/collection-picker-sheet";
import { ConfirmDialog } from "../../components/confirm-dialog";
import BulkRatingSheet from "./bulk-rating-sheet";
import { bookCount, titleList } from "./bulk-summary";
import BulkTagSheet from "./bulk-tag-sheet";
import { tagPatchFor } from "./bulk-tags";
import type { UseLibrarySelection } from "./use-library-selection";

type Props = {
	selection: UseLibrarySelection;
	/** Tags already in use across the library, offered alongside the selection's. */
	libraryTags: string[];
};

/** Every overlay a bulk action can open: the menu, its pickers, the delete
 *  confirm, and the summary shown when something failed. */
const BulkSheets: React.FC<Props> = ({ selection, libraryTags }) => {
	const { picked } = selection;
	const title = bookCount(picked.length);

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
						label: "Add to collection",
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
				count={picked.length}
				onClose={selection.closeSheet}
				onApply={(rating) => selection.run({ kind: "rating", rating })}
			/>

			<CollectionPickerSheet
				books={selection.pickedInView}
				open={selection.sheet === "collection"}
				onClose={selection.closeSheet}
			/>

			<BulkTagSheet
				isOpen={selection.sheet === "tags"}
				picked={picked}
				libraryTags={libraryTags}
				onClose={selection.closeSheet}
				onApply={(intents) =>
					selection.run({ kind: "tags", patch: (book) => tagPatchFor(book, intents) })
				}
			/>

			<ConfirmDialog
				open={selection.isDeleteOpen}
				onOpenChange={selection.setDeleteOpen}
				title={picked.length === 1 ? "Delete book?" : `Delete ${title}?`}
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
