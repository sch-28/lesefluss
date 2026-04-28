/**
 * GlossaryEntryModal — bottom sheet for viewing / editing one glossary entry.
 *
 * - Auto-saves on blur for label + notes; instant save on color/scope changes.
 * - "Available in all books" toggle flips bookId between the current book and null.
 * - Jump buttons close the sheet and seek the reader.
 * - Delete removes the entry and closes.
 *
 * Mirrors HighlightModal's shape: one IonModal, gated by `isOpen={!!entry}`,
 * so close animations work and breakpoints aren't fighting a re-mount.
 */

import {
	IonContent,
	IonHeader,
	IonIcon,
	IonInput,
	IonItem,
	IonLabel,
	IonModal,
	IonTextarea,
	IonTitle,
	IonToggle,
	IonToolbar,
} from "@ionic/react";
import { trashOutline } from "ionicons/icons";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import type { GlossaryEntry } from "../../services/db/schema";
import GlossaryAvatar, { colorFromLabel } from "./glossary-avatar";

const GLOSSARY_PALETTE: { name: string; value: string }[] = [
	{ name: "auto", value: "" }, // empty triggers auto-derive from label
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
	/** The entry being edited. null = modal closed. */
	entry: GlossaryEntry | null;
	/** ID of the book the reader is currently in — used when the user toggles scope back to "this book". */
	currentBookId: string;
	/** Surrounding text from the first occurrence of the label in the current book. */
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
	// Tap-to-edit: label renders as plain text by default so the IonInput isn't
	// the first focusable child (Ionic's focus trap auto-focuses it on present,
	// which pops the keyboard). Drafts go straight into edit mode since the
	// label starts empty and the user came here to type one.
	const [isEditingLabel, setIsEditingLabel] = useState(false);
	const labelInputRef = useRef<HTMLIonInputElement>(null);

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

	// When entering edit mode, focus the input so the user can type immediately.
	useEffect(() => {
		if (isEditingLabel) {
			labelInputRef.current?.setFocus();
		}
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
		<IonModal
			isOpen={!!entry}
			onDidDismiss={onClose}
			breakpoints={[0, 0.5, 1]}
			initialBreakpoint={0.5}
			className={["rsvp-glossary-modal", theme && `reader-theme-${theme}`]
				.filter(Boolean)
				.join(" ")}
		>
			<IonHeader>
				<IonToolbar>
					<IonTitle>Glossary entry</IonTitle>
				</IonToolbar>
			</IonHeader>

			<IonContent className="ion-padding">
				<div className="glossary-modal-header">
					<GlossaryAvatar label={effectiveLabel} color={effectiveColor} size={48} />
					{isEditingLabel ? (
						<IonInput
							ref={labelInputRef}
							value={label}
							onIonInput={(e) => setLabel(e.detail.value ?? "")}
							onIonBlur={commitLabel}
							placeholder="Name"
							className="glossary-modal-label"
						/>
					) : (
						<button
							type="button"
							className="glossary-modal-label-display"
							onClick={() => setIsEditingLabel(true)}
						>
							{effectiveLabel || "Untitled"}
						</button>
					)}
					<button
						type="button"
						className="glossary-modal-delete-btn"
						onClick={handleDelete}
						aria-label="Delete entry"
					>
						<IonIcon icon={trashOutline} />
					</button>
				</div>

				{/* First-mention preview from the current book */}
				{firstMentionContext && (
					<blockquote className="glossary-modal-context">
						...{firstMentionContext.before}
						<mark>{firstMentionContext.match}</mark>
						{firstMentionContext.after}...
					</blockquote>
				)}

				{/* Color row */}
				<div className="glossary-modal-row">
					<div className="glossary-modal-colors">
						{GLOSSARY_PALETTE.map((c) => (
							<button
								key={c.name}
								type="button"
								className={
									(c.value === "" && color === "") || color === c.value
										? "glossary-color-swatch glossary-color-swatch--active"
										: "glossary-color-swatch"
								}
								style={{
									background: c.value === "" ? colorFromLabel(effectiveLabel) : c.value,
								}}
								onClick={() => handleColorChange(c.value)}
								aria-label={`Color ${c.name}`}
							/>
						))}
					</div>
				</div>

				{/* Scope toggle */}
				<IonItem className="glossary-modal-scope">
					<IonLabel>
						<h3>Available in all books</h3>
						<p>Highlight this term in every book, not just the current one.</p>
					</IonLabel>
					<IonToggle
						checked={isGlobal}
						onIonChange={(e) => handleScopeChange(e.detail.checked)}
						aria-label="Global glossary entry"
					/>
				</IonItem>

				{/* Hide-marker toggle (per entry) */}
				<IonItem className="glossary-modal-scope">
					<IonLabel>
						<h3>Hide marker</h3>
						<p>
							Don't show the colored marker next to this term. Tapping it still opens the entry.
						</p>
					</IonLabel>
					<IonToggle
						checked={hideMarker}
						onIonChange={(e) => handleHideMarkerChange(e.detail.checked)}
						aria-label="Hide marker for this entry"
					/>
				</IonItem>

				{/* Notes */}
				<IonTextarea
					value={notes}
					onIonInput={(e) => setNotes(e.detail.value ?? "")}
					onIonBlur={commitNotes}
					placeholder="Notes…"
					autoGrow
					rows={2}
					className="glossary-modal-notes"
				/>

				{/* Jump actions — disabled when label has no mention in the current book
				    (firstMentionContext is the upstream "found a match" signal). */}
				<div className="glossary-modal-actions">
					<button
						type="button"
						className="glossary-modal-action-btn"
						disabled={!firstMentionContext}
						onClick={() => {
							onJumpFirst(effectiveLabel);
							onClose();
						}}
					>
						Jump to first mention
					</button>
					<button
						type="button"
						className="glossary-modal-action-btn"
						disabled={!firstMentionContext}
						onClick={() => {
							onJumpNext(effectiveLabel);
							onClose();
						}}
					>
						Jump to next mention
					</button>
				</div>
			</IonContent>
		</IonModal>
	);
};

export default GlossaryEntryModal;
