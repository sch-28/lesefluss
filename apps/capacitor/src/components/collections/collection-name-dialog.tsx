import { COLLECTION_NAME_MAX } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import { Input } from "@lesefluss/ui/input";
import type React from "react";
import { useEffect, useState } from "react";
import { Modal } from "../modal";

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	confirmLabel: string;
	initialName?: string;
	onSubmit: (name: string) => void;
};

export const CollectionNameDialog: React.FC<Props> = ({
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
	const submit = () => {
		if (!trimmed) return;
		onSubmit(trimmed);
		onOpenChange(false);
	};

	return (
		<Modal open={open} onOpenChange={onOpenChange} title={title}>
			<Input
				autoFocus
				value={name}
				maxLength={COLLECTION_NAME_MAX}
				placeholder="Collection name"
				aria-label="Collection name"
				onChange={(e) => setName(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter") submit();
				}}
			/>
			<Button onClick={submit} disabled={!trimmed} className="w-full">
				{confirmLabel}
			</Button>
		</Modal>
	);
};
