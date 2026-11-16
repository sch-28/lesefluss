import { isLikelyUrl, normalizeUrl } from "@lesefluss/book-import";
import { Button } from "@lesefluss/ui/button";
import { Input, InputHitArea } from "@lesefluss/ui/input";
import { Loader2 } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { EntryDialog } from "../../components/entry-dialog";

/** A web address with a dotted host, so a stray word like "hello" can't start an import. */
export function isImportableUrl(raw: string): boolean {
	const url = normalizeUrl(raw);
	return isLikelyUrl(url) && new URL(url).hostname.includes(".");
}

interface PasteUrlModalProps {
	isOpen: boolean;
	isImporting: boolean;
	/** Why the last import failed, with what to try; shown under the field. */
	error: string | null;
	onClearError: () => void;
	onClose: () => void;
	onSubmit: (url: string) => void;
}

const PasteUrlModal: React.FC<PasteUrlModalProps> = ({
	isOpen,
	isImporting,
	error,
	onClearError,
	onClose,
	onSubmit,
}) => {
	const [value, setValue] = useState("");

	useEffect(() => {
		if (isOpen) setValue("");
	}, [isOpen]);

	const canSubmit = !isImporting && isImportableUrl(value);

	const handleSubmit = () => {
		if (!canSubmit) return;
		onSubmit(normalizeUrl(value));
	};

	return (
		<EntryDialog
			open={isOpen}
			onOpenChange={(open) => {
				if (!open) {
					onClearError();
					onClose();
				}
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
				<InputHitArea>
					<Input
						type="url"
						inputMode="url"
						autoCapitalize="off"
						autoCorrect="off"
						spellCheck={false}
						enterKeyHint="go"
						aria-label="Book or article URL"
						aria-invalid={error ? true : undefined}
						aria-describedby={error ? "url-import-error" : undefined}
						placeholder="https://www.royalroad.com/fiction/..."
						value={value}
						onChange={(e) => {
							setValue(e.target.value);
							if (error) onClearError();
						}}
						disabled={isImporting}
					/>
				</InputHitArea>
				{error && (
					<p
						id="url-import-error"
						role="alert"
						data-testid="url-import-error"
						className="m-0 text-destructive text-sm"
					>
						{error}
					</p>
				)}
				<Button type="submit" disabled={!canSubmit} className="w-full md:ml-auto md:w-auto">
					{isImporting ? <Loader2 className="animate-spin" /> : null}
					{isImporting ? "Importing..." : "Import"}
				</Button>
			</form>
		</EntryDialog>
	);
};

export default PasteUrlModal;
