/**
 * GlossaryEntryModal: bottom drawer for viewing / editing one glossary entry.
 *
 * Auto-saves on blur for label + notes; instant save on color/scope changes.
 * "Available in all books" toggle flips bookId between the current book and null.
 * Jump buttons close the drawer and seek the reader. Delete removes and closes.
 */

import { Button } from "@lesefluss/ui/button";
import {
	Drawer,
	DrawerContent,
	DrawerHeader,
	DrawerTitle,
} from "@lesefluss/ui/drawer";
import { Switch } from "@lesefluss/ui/switch";
import { cn } from "@lesefluss/ui/utils";
import { Trash2 } from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import type { GlossaryEntry } from "../../services/db/schema";
import GlossaryAvatar, { colorFromLabel } from "./glossary-avatar";

const GLOSSARY_PALETTE: { name: string; value: string }[] = [
	{ name: "auto", value: "" },
	{ name: "red", value: "#E57373" },
	{ name: "orange", value: "#FFB74D" },
	{ name: "yellow", value: "#FFEB3B" },
	{ name: "lime", value: "#DCE775" },
	{ name: "green", value: "#81C784" },
	{ name: "teal", value: "#4DB6AC" },
	{ name: "cyan", value: "#4DD0E1" },
	{ name: "blue", value: "#64B5F6" },
	{ name: "indigo", value: "#7986CB" },
	{ name: "purple", value: "#BA68C8" },
	{ name: "pink", value: "#F06292" },
	{ name: "brown", value: "#A1887F" },
];

export interface GlossaryEntryModalProps {
	entry: GlossaryEntry | null;
	currentBookId: string;
	firstMentionContext: { before: string; match: string; after: string } | null;
	onClose: () => void;
	onSave: (
		id: string,
		patch: Partial<Pick<GlossaryEntry, "label" | "notes" | "color" | "bookId" | "hideMarker">>,
	) => void;
	onDelete: (id: string) => void;
	onJumpFirst: (label: string) => void;
	onJumpNext: (label: string) => void;
	theme?: string;
}

const GlossaryEntryModal: React.FC<GlossaryEntryModalProps> = ({
	entry,
	currentBookId,
	firstMentionContext,
	onClose,
	onSave,
	onDelete,
	onJumpFirst,
	onJumpNext,
	theme,
}) => {
	const [label, setLabel] = useState("");
	const [notes, setNotes] = useState("");
	const [color, setColor] = useState("");
	const [isGlobal, setIsGlobal] = useState(false);
	const [hideMarker, setHideMarker] = useState(false);
	// Tap-to-edit: label renders as plain text by default so the input isn't the
	// first focusable child (radix focus trap auto-focuses on present, popping the
	// keyboard). Drafts go straight into edit mode since label starts empty.
	const [isEditingLabel, setIsEditingLabel] = useState(false);
	const labelInputRef = useRef<HTMLInputElement>(null);

	// Re-seed only when a different entry opens; keep in-progress edits otherwise.
	// biome-ignore lint/correctness/useExhaustiveDependencies: entry?.id is the intentional narrow dep
	useEffect(() => {
		if (entry) {
			setLabel(entry.label);
			setNotes(entry.notes ?? "");
			setColor(entry.color);
			setIsGlobal(entry.bookId === null);
			setHideMarker(entry.hideMarker);
			setIsEditingLabel(entry.label.length === 0);
		}
	}, [entry?.id]);

	useEffect(() => {
		if (isEditingLabel) labelInputRef.current?.focus();
	}, [isEditingLabel]);

	const effectiveLabel = label || entry?.label || "";
	const effectiveColor = color || colorFromLabel(effectiveLabel);

	const commitLabel = () => {
		setIsEditingLabel(false);
		if (!entry) return;
		const trimmed = label.trim();
		if (!trimmed || trimmed === entry.label) return;
		onSave(entry.id, { label: trimmed });
	};

	const commitNotes = () => {
		if (!entry) return;
		const next = notes.trim() ? notes : null;
		if (next === entry.notes) return;
		onSave(entry.id, { notes: next });
	};

	const handleColorChange = (next: string) => {
		if (!entry) return;
		setColor(next);
		onSave(entry.id, { color: next || colorFromLabel(effectiveLabel) });
	};

	const handleScopeChange = (nextGlobal: boolean) => {
		if (!entry) return;
		setIsGlobal(nextGlobal);
		onSave(entry.id, { bookId: nextGlobal ? null : currentBookId });
	};

	const handleHideMarkerChange = (next: boolean) => {
		if (!entry) return;
		setHideMarker(next);
		onSave(entry.id, { hideMarker: next });
	};

	const handleDelete = () => {
		if (!entry) return;
		onDelete(entry.id);
		onClose();
	};

	return (
		<Drawer
			open={!!entry}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DrawerContent className={theme ? `reader-theme-${theme}` : undefined}>
				<DrawerHeader>
					<DrawerTitle>Glossary entry</DrawerTitle>
				</DrawerHeader>

				<div className="flex flex-col gap-4 overflow-y-auto px-5 pb-6">
					<div className="flex items-center gap-3">
						<GlossaryAvatar label={effectiveLabel} color={effectiveColor} size={48} />
						{isEditingLabel ? (
							<input
								ref={labelInputRef}
								type="text"
								value={label}
								onChange={(e) => setLabel(e.target.value)}
								onBlur={commitLabel}
								placeholder="Name"
								className="flex-1 border-border border-b bg-transparent py-1 text-foreground text-lg outline-none focus:border-foreground"
							/>
						) : (
							<button
								type="button"
								className="flex-1 truncate text-left font-semibold text-foreground text-lg"
								onClick={() => setIsEditingLabel(true)}
							>
								{effectiveLabel || "Untitled"}
							</button>
						)}
						<button
							type="button"
							onClick={handleDelete}
							aria-label="Delete entry"
							className="inline-flex size-9 items-center justify-center rounded-md text-destructive transition-colors hover:bg-destructive/10"
						>
							<Trash2 className="size-5" />
						</button>
					</div>

					{firstMentionContext && (
						<blockquote className="m-0 border-border border-l-2 pl-3 text-muted-foreground text-sm italic">
							...{firstMentionContext.before}
							<mark className="bg-yellow-200/60 px-0.5 not-italic dark:bg-yellow-500/30">
								{firstMentionContext.match}
							</mark>
							{firstMentionContext.after}...
						</blockquote>
					)}

					<div className="flex flex-wrap gap-2">
						{GLOSSARY_PALETTE.map((c) => {
							const isActive = (c.value === "" && color === "") || color === c.value;
							return (
								<button
									key={c.name}
									type="button"
									className={cn(
										"size-7 rounded-full border-2 transition-transform",
										isActive ? "scale-110 border-foreground" : "border-border",
									)}
									style={{
										background: c.value === "" ? colorFromLabel(effectiveLabel) : c.value,
									}}
									onClick={() => handleColorChange(c.value)}
									aria-label={`Color ${c.name}`}
								/>
							);
						})}
					</div>

					<div className="flex items-start justify-between gap-3 border-border border-b py-3">
						<div className="flex flex-col gap-0.5">
							<span className="font-medium text-foreground text-sm">Available in all books</span>
							<span className="text-muted-foreground text-xs">
								Highlight this term in every book, not just the current one.
							</span>
						</div>
						<Switch
							checked={isGlobal}
							onCheckedChange={handleScopeChange}
							aria-label="Global glossary entry"
						/>
					</div>

					<div className="flex items-start justify-between gap-3 border-border border-b py-3">
						<div className="flex flex-col gap-0.5">
							<span className="font-medium text-foreground text-sm">Hide marker</span>
							<span className="text-muted-foreground text-xs">
								Don't show the colored marker next to this term. Tapping still opens the entry.
							</span>
						</div>
						<Switch
							checked={hideMarker}
							onCheckedChange={handleHideMarkerChange}
							aria-label="Hide marker for this entry"
						/>
					</div>

					<textarea
						value={notes}
						onChange={(e) => setNotes(e.target.value)}
						onBlur={commitNotes}
						placeholder="Notes…"
						rows={3}
						className="min-h-20 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/50"
					/>

					{/* Jump buttons disabled when label has no mention in current book. */}
					<div className="flex flex-col gap-2">
						<Button
							variant="outline"
							disabled={!firstMentionContext}
							onClick={() => {
								onJumpFirst(effectiveLabel);
								onClose();
							}}
						>
							Jump to first mention
						</Button>
						<Button
							variant="outline"
							disabled={!firstMentionContext}
							onClick={() => {
								onJumpNext(effectiveLabel);
								onClose();
							}}
						>
							Jump to next mention
						</Button>
					</div>
				</div>
			</DrawerContent>
		</Drawer>
	);
};

export default GlossaryEntryModal;
