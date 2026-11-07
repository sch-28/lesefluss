import { COLLECTION_NAME_MAX } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@lesefluss/ui/drawer";
import { Input } from "@lesefluss/ui/input";
import type React from "react";
import { useEffect, useState } from "react";
import { useBackHandler } from "../../hooks/use-back-handler";
import { useMediaQuery } from "../../hooks/use-media-query";
import { Modal } from "../modal";

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	confirmLabel: string;
	initialName?: string;
	placeholder?: string;
	onSubmit: (name: string) => void;
};

/**
 * A centred dialog on desktop, a bottom sheet on phone: the native shell resizes
 * the WebView for the keyboard, which re-centres a dialog mid-animation, while a
 * sheet stays docked to the bottom like the app's other input sheets.
 */
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
	const isDesktop = useMediaQuery("(min-width: 768px)");
	useBackHandler(open, () => onOpenChange(false));

	useEffect(() => {
		if (open) setName(initialName);
	}, [open, initialName]);

	const trimmed = name.trim();

	// A form, so the keyboard's action key submits through the browser's own implicit submission.
	const form = (
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
	);

	if (isDesktop) {
		return (
			<Modal open={open} onOpenChange={onOpenChange} title={title} contentClassName="sm:max-w-sm">
				{form}
			</Modal>
		);
	}

	return (
		<Drawer open={open} onOpenChange={onOpenChange}>
			<DrawerContent>
				<DrawerHeader>
					<DrawerTitle>{title}</DrawerTitle>
				</DrawerHeader>
				<div className="px-5 pb-5">{form}</div>
			</DrawerContent>
		</Drawer>
	);
};
