import { SMART_SHELF_NAME_MAX } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import { Input } from "@lesefluss/ui/input";
import type React from "react";
import { useEffect, useState } from "react";
import { EntryDialog } from "../entry-dialog";

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	confirmLabel: string;
	initialName?: string;
	onSubmit: (name: string) => void;
};

export const ShelfNameDialog: React.FC<Props> = ({
	open,
	onOpenChange,
	title,
	confirmLabel,
	initialName = "",
	onSubmit,
}) => {
	const [name, setName] = useState(initialName);

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
					maxLength={SMART_SHELF_NAME_MAX}
					placeholder="Shelf name"
					aria-label="Shelf name"
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
