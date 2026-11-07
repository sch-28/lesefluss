import { COLLECTION_NAME_MAX } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import { Input } from "@lesefluss/ui/input";
import type React from "react";
import { useEffect, useState } from "react";
import { queryHooks } from "../../services/db/hooks";
import { EntryDialog } from "../entry-dialog";

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	collection: { id: string; name: string; seriesKey: string | null };
};

/** Changes the name only: a series keeps its key, so imports of it still join. */
export const RenameCollectionDialog: React.FC<Props> = ({ open, onOpenChange, collection }) => {
	const [name, setName] = useState(collection.name);
	const rename = queryHooks.useRenameCollection();

	useEffect(() => {
		if (open) setName(collection.name);
	}, [open, collection.name]);

	const trimmed = name.trim();
	const canSave = trimmed !== "" && trimmed !== collection.name && !rename.isPending;
	const noun = collection.seriesKey ? "series" : "collection";

	const save = () => {
		if (!canSave) return;
		rename.mutate({ id: collection.id, name: trimmed }, { onSuccess: () => onOpenChange(false) });
	};

	return (
		<EntryDialog open={open} onOpenChange={onOpenChange} title={`Rename ${noun}`}>
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
					maxLength={COLLECTION_NAME_MAX}
					aria-label={`${noun[0]?.toUpperCase()}${noun.slice(1)} name`}
					enterKeyHint="done"
					onChange={(e) => setName(e.target.value)}
				/>
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
						Rename
					</Button>
				</div>
			</form>
		</EntryDialog>
	);
};
