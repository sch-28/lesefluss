import { SMART_SHELF_NAME_MAX } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import { Input } from "@lesefluss/ui/input";
import { useNavigate } from "@tanstack/react-router";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { filterToTree, serializeTree } from "../../pages/library/condition-tree";
import {
	activeFilterCount,
	encodeFilterParam,
	type LibraryFilter,
	matchesFilter,
} from "../../pages/library/filter-model";
import { useShelfLibrary } from "../../pages/library/use-smart-shelves";
import { queryHooks } from "../../services/db/hooks";
import { EntryDialog } from "../entry-dialog";
import { ConditionChips } from "./condition-chips";

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	filter: LibraryFilter;
};

export function canSaveAsShelf(filter: LibraryFilter): boolean {
	return activeFilterCount(filter) > 0;
}

/** Saves the current filter as a smart shelf and opens it. */
export const SaveShelfDialog: React.FC<Props> = ({ open, onOpenChange, filter }) => {
	const [name, setName] = useState("");
	const [pinned, setPinned] = useState(true);
	const { items, options } = useShelfLibrary(open);
	const create = queryHooks.useCreateSmartShelf();
	const navigate = useNavigate();

	useEffect(() => {
		if (open) {
			setName("");
			setPinned(true);
		}
	}, [open]);

	const count = useMemo(
		() => (open ? items.filter((item) => matchesFilter(item.facets, filter)).length : 0),
		[open, items, filter],
	);
	const trimmed = name.trim();
	const canSave = trimmed !== "" && canSaveAsShelf(filter) && !create.isPending;

	const save = () => {
		if (!canSave) return;
		create.mutate(
			{ name: trimmed, conditions: serializeTree(filterToTree(filter)), pinned },
			{
				onSuccess: (row) => {
					onOpenChange(false);
					navigate({
						to: "/tabs/library",
						search: { shelf: row.id, f: encodeFilterParam(filter) },
					});
				},
			},
		);
	};

	// A form, so the keyboard's action key submits through the browser's own implicit submission.
	return (
		<EntryDialog open={open} onOpenChange={onOpenChange} title="Save as smart shelf">
			<form
				className="flex flex-col gap-3"
				onSubmit={(e) => {
					e.preventDefault();
					save();
				}}
			>
				<Input
					autoFocus
					value={name}
					maxLength={SMART_SHELF_NAME_MAX}
					placeholder="Shelf name"
					aria-label="Shelf name"
					enterKeyHint="done"
					onChange={(e) => setName(e.target.value)}
				/>
				<div className="flex flex-col gap-1.5">
					<span className="text-muted-foreground text-xs">Books that match</span>
					<ConditionChips filter={filter} options={options} />
				</div>
				<p className="m-0 text-muted-foreground text-sm" data-testid="shelf-live-count">
					{count} {count === 1 ? "book matches" : "books match"} right now
				</p>
				<label className="flex items-center gap-2 text-sm">
					<input
						type="checkbox"
						checked={pinned}
						onChange={(e) => setPinned(e.target.checked)}
						className="size-4 accent-primary"
					/>
					Pin to sidebar
				</label>
				<div className="flex gap-2 pt-1 md:justify-end">
					<Button
						type="button"
						variant="outline"
						className="flex-1 md:flex-none"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button type="submit" disabled={!canSave} className="flex-1 md:flex-none">
						Save
					</Button>
				</div>
			</form>
		</EntryDialog>
	);
};
