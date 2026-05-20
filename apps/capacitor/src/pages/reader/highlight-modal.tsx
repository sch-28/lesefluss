/**
 * HighlightModal: bottom drawer for viewing and editing an existing highlight.
 *
 * Auto-saves: color change saves immediately; note saves on blur.
 * No explicit Save/Cancel: dismissed by drag-down. Only action button is Delete.
 */

import {
	Drawer,
	DrawerContent,
	DrawerHeader,
	DrawerTitle,
} from "@lesefluss/ui/drawer";
import { cn } from "@lesefluss/ui/utils";
import { Trash2 } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import type { Highlight } from "../../services/db/schema";
import { HIGHLIGHT_COLOR_STYLE, HIGHLIGHT_COLORS, type HighlightColor } from "./selection-toolbar";

interface HighlightModalProps {
	/** The highlight being viewed/edited. null = modal closed. */
	highlight: Highlight | null;
	highlightText: string;
	onClose: () => void;
	onSave: (id: string, color: string, note: string) => void;
	onDelete: (id: string) => void;
	theme?: string;
}

const HighlightModal: React.FC<HighlightModalProps> = ({
	highlight,
	highlightText,
	onClose,
	onSave,
	onDelete,
	theme,
}) => {
	const [color, setColor] = useState<HighlightColor>("yellow");
	const [note, setNote] = useState("");
	// Keyed on id only. Re-seeding on every field change would overwrite in-progress edits.
	// biome-ignore lint/correctness/useExhaustiveDependencies: highlight?.id is the intentional narrow dep
	useEffect(() => {
		if (highlight) {
			const safeColor = (HIGHLIGHT_COLORS as readonly string[]).includes(highlight.color)
				? (highlight.color as HighlightColor)
				: "yellow";
			setColor(safeColor);
			setNote(highlight.note ?? "");
		}
	}, [highlight?.id]);

	const handleColorChange = (c: HighlightColor) => {
		setColor(c);
		if (highlight) onSave(highlight.id, c, note);
	};

	const handleNoteBlur = () => {
		if (highlight) onSave(highlight.id, color, note);
	};

	const handleDelete = () => {
		if (!highlight) return;
		onDelete(highlight.id);
		onClose();
	};

	return (
		<Drawer
			open={!!highlight}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DrawerContent className={theme ? `reader-theme-${theme}` : undefined}>
				<DrawerHeader>
					<DrawerTitle>Highlight</DrawerTitle>
				</DrawerHeader>

				<div className="flex flex-col gap-4 px-5 pb-6">
					{highlightText && (
						<blockquote className="m-0 border-border border-l-2 pl-3 text-muted-foreground text-sm italic">
							"{highlightText}"
						</blockquote>
					)}

					<div className="flex items-center justify-between gap-2">
						<div className="flex gap-2">
							{HIGHLIGHT_COLORS.map((c) => (
								<button
									key={c}
									type="button"
									className={cn(
										"size-7 rounded-full border-2 transition-transform",
										color === c ? "scale-110 border-foreground" : "border-border",
									)}
									style={{ background: HIGHLIGHT_COLOR_STYLE[c] }}
									onClick={() => handleColorChange(c)}
									aria-label={`Highlight ${c}`}
								/>
							))}
						</div>
						<button
							type="button"
							onClick={handleDelete}
							aria-label="Delete highlight"
							className="inline-flex size-9 items-center justify-center rounded-md text-destructive transition-colors hover:bg-destructive/10"
						>
							<Trash2 className="size-5" />
						</button>
					</div>

					<textarea
						value={note}
						onChange={(e) => setNote(e.target.value)}
						onBlur={handleNoteBlur}
						placeholder="Add a note…"
						rows={3}
						className="min-h-20 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/50"
					/>
				</div>
			</DrawerContent>
		</Drawer>
	);
};

export default HighlightModal;
