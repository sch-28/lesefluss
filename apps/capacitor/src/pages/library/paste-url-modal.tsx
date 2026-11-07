import { isLikelyUrl, normalizeUrl } from "@lesefluss/book-import";
import { Button } from "@lesefluss/ui/button";
import { Input } from "@lesefluss/ui/input";
import { Loader2 } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { EntryDialog } from "../../components/entry-dialog";
import { useBackHandler } from "../../hooks/use-back-handler";

interface PasteUrlModalProps {
	isOpen: boolean;
	isImporting: boolean;
	onClose: () => void;
	onSubmit: (url: string) => void;
}

const PasteUrlModal: React.FC<PasteUrlModalProps> = ({
	isOpen,
	isImporting,
	onClose,
	onSubmit,
}) => {
	const [value, setValue] = useState("");
	useBackHandler(isOpen, () => {
		if (!isImporting) onClose();
	});

	useEffect(() => {
		if (isOpen) setValue("");
	}, [isOpen]);

	const canSubmit = !isImporting && isLikelyUrl(normalizeUrl(value));

	const handleSubmit = () => {
		if (!canSubmit) return;
		onSubmit(normalizeUrl(value));
	};

	return (
		<EntryDialog
			open={isOpen}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
			title="Import from URL"
			description="Paste an article link or a supported web novel URL from Royal Road, ScribbleHub, Archive of Our Own, or Wuxiaworld."
			dismissable={!isImporting}
		>
			{/* noValidate: a bare "example.com" fails type=url but normalizeUrl accepts it. */}
			<form
				noValidate
				className="flex flex-col gap-3"
				onSubmit={(e) => {
					e.preventDefault();
					handleSubmit();
				}}
			>
				<Input
					type="url"
					inputMode="url"
					autoCapitalize="off"
					autoCorrect="off"
					spellCheck={false}
					enterKeyHint="go"
					aria-label="Book or article URL"
					placeholder="https://www.royalroad.com/fiction/..."
					value={value}
					onChange={(e) => setValue(e.target.value)}
					disabled={isImporting}
				/>
				<Button type="submit" disabled={!canSubmit} className="w-full">
					{isImporting ? <Loader2 className="animate-spin" /> : null}
					{isImporting ? "Importing..." : "Import"}
				</Button>
			</form>
		</EntryDialog>
	);
};

export default PasteUrlModal;
