import { Button } from "@lesefluss/ui/button";
import { Loader2 } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { EntryDialog } from "../../components/entry-dialog";
import { textareaClass } from "./book-edit-fields";

interface PasteTextModalProps {
	isOpen: boolean;
	isImporting: boolean;
	onClose: () => void;
	onSubmit: (text: string) => void;
}

/** Where Paste text lands on the web when the browser can't or won't hand over the clipboard. */
const PasteTextModal: React.FC<PasteTextModalProps> = ({
	isOpen,
	isImporting,
	onClose,
	onSubmit,
}) => {
	const [value, setValue] = useState("");

	useEffect(() => {
		if (isOpen) setValue("");
	}, [isOpen]);

	const canSubmit = !isImporting && value.trim().length > 0;

	return (
		<EntryDialog
			open={isOpen}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
			title="Paste text"
			description="Your browser didn't share the clipboard. Paste the text here."
			dismissable={!isImporting}
		>
			<form
				className="flex flex-col gap-3"
				onSubmit={(e) => {
					e.preventDefault();
					if (canSubmit) onSubmit(value);
				}}
			>
				<textarea
					aria-label="Text to import"
					rows={8}
					value={value}
					onChange={(e) => setValue(e.target.value)}
					disabled={isImporting}
					placeholder="Paste here"
					className={`${textareaClass} max-h-[50dvh] resize-y`}
				/>
				<Button type="submit" disabled={!canSubmit} className="w-full md:ml-auto md:w-auto">
					{isImporting ? <Loader2 className="animate-spin" /> : null}
					{isImporting ? "Importing..." : "Import"}
				</Button>
			</form>
		</EntryDialog>
	);
};

export default PasteTextModal;
