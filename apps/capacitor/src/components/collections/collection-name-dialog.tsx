import { COLLECTION_NAME_MAX } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import { Input } from "@lesefluss/ui/input";
import type React from "react";
import { useEffect, useState } from "react";
import { useBackHandler } from "../../hooks/use-back-handler";
import { EntryDialog } from "../entry-dialog";

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	confirmLabel: string;
	initialName?: string;
	placeholder?: string;
	onSubmit: (name: string) => void;
};

export const CollectionNameDialog: React.FC<Props> = ({
	open,
	onOpenChange,
	title,
	confirmLabel,
	initialName = "",
	placeholder = "Collection name",
	onSubmit,
}) => {
	const [name, setName] = useState(initialName);
	useBackHandler(open, () => onOpenChange(false));

	useEffect(() => {
		if (open) setName(initialName);
	}, [open, initialName]);

	const trimmed = name.trim();

	// A form, so the keyboard's action key submits through the browser's own implicit submission.
	return (
		<EntryDialog
			open={open}
			onOpenChange={onOpenChange}
			title={title}
			contentClassName="sm:max-w-sm"
		>
			<form
				className="flex flex-col gap-4"
				onSubmit={(e) => {
					e.preventDefault();
					if (!trimmed) return;
					onSubmit(trimmed);
					onOpenChange(false);
				}}
			>
				<Input
					autoFocus
					value={name}
					maxLength={COLLECTION_NAME_MAX}
					placeholder={placeholder}
					aria-label={placeholder}
					enterKeyHint="done"
					onChange={(e) => setName(e.target.value)}
				/>
				<div className="flex gap-2 md:justify-end">
					<Button
						type="button"
						variant="outline"
						className="flex-1 md:flex-none"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button type="submit" disabled={!trimmed} className="flex-1 md:flex-none">
						{confirmLabel}
					</Button>
				</div>
			</form>
		</EntryDialog>
	);
};
