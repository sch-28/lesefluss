import { isLikelyUrl, normalizeUrl } from "@lesefluss/book-import";
import { Button } from "@lesefluss/ui/button";
import { Input } from "@lesefluss/ui/input";
import { Loader2 } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { Modal } from "../../components/modal";

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

	useEffect(() => {
		if (isOpen) setValue("");
	}, [isOpen]);

	const canSubmit = !isImporting && isLikelyUrl(normalizeUrl(value));

	const handleSubmit = () => {
		if (!canSubmit) return;
		onSubmit(normalizeUrl(value));
	};

	return (
		<Modal
			open={isOpen}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
			title="Import from URL"
			description="Paste an article link or a supported web novel URL from Royal Road, ScribbleHub, Archive of Our Own, or Wuxiaworld."
			dismissable={!isImporting}
		>
			<Input
				type="url"
				inputMode="url"
				autoCapitalize="off"
				autoCorrect="off"
				spellCheck={false}
				placeholder="https://www.royalroad.com/fiction/..."
				value={value}
				onChange={(e) => setValue(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter") handleSubmit();
				}}
				disabled={isImporting}
			/>
			<Button onClick={handleSubmit} disabled={!canSubmit} className="w-full">
				{isImporting ? <Loader2 className="animate-spin" /> : null}
				{isImporting ? "Importing..." : "Import"}
			</Button>
		</Modal>
	);
};

export default PasteUrlModal;
