/**
 * HighlightModal — bottom sheet for viewing and editing an existing highlight.
 *
 * Auto-saves: color change saves immediately; note saves on blur.
 * No explicit Save/Cancel — sheet is dismissed by dragging down.
 * Only action button is Delete.
 */

import {
	IonContent,
	IonHeader,
	IonIcon,
	IonModal,
	IonTextarea,
	IonTitle,
	IonToolbar,
} from "@ionic/react";
import { trashOutline } from "ionicons/icons";
import type React from "react";
import { useEffect, useState } from "react";
import type { Highlight } from "../../services/db/schema";
import { HIGHLIGHT_COLOR_STYLE, HIGHLIGHT_COLORS, type HighlightColor } from "./selection-toolbar";

interface HighlightModalProps {
	/** The highlight being viewed/edited. null = modal closed. */
	highlight: Highlight | null;
	/** Extracted text snippet for the highlighted range. */
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
	// Seed local state whenever a different highlight opens
	useEffect(() => {
		if (highlight) {
			const safeColor = (HIGHLIGHT_COLORS as readonly string[]).includes(highlight.color)
				? (highlight.color as HighlightColor)
				: "yellow";
			setColor(safeColor);
			setNote(highlight.note ?? "");
		}
	}, [highlight?.id]); // intentional: only re-seed when a different highlight opens

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
		<IonModal
			isOpen={!!highlight}
			onDidDismiss={onClose}
			breakpoints={[0, 0.5, 1]}
			initialBreakpoint={0.5}
			className={["rsvp-highlight-modal", theme && `reader-theme-${theme}`]
				.filter(Boolean)
				.join(" ")}
		>
			<IonHeader>
				<IonToolbar>
					<IonTitle>Highlight</IonTitle>
				</IonToolbar>
			</IonHeader>

			<IonContent className="ion-padding">
				{/* Quoted text snippet */}
				{highlightText && (
					<blockquote className="highlight-modal-snippet">"{highlightText}"</blockquote>
				)}

				{/* Color picker + delete on one row */}
				<div className="highlight-modal-row">
					<div className="highlight-modal-colors">
						{HIGHLIGHT_COLORS.map((c) => (
							<button
								key={c}
								type="button"
								className={`selection-color-swatch${color === c ? " selection-color-swatch--active" : ""}`}
								style={{ background: HIGHLIGHT_COLOR_STYLE[c] }}
								onClick={() => handleColorChange(c)}
								aria-label={`Highlight ${c}`}
							/>
						))}
					</div>
					<button
						type="button"
						className="highlight-modal-delete-btn"
						onClick={handleDelete}
						aria-label="Delete highlight"
					>
						<IonIcon icon={trashOutline} />
					</button>
				</div>

				{/* Note textarea — auto-saves on blur */}
				<IonTextarea
					value={note}
					onIonInput={(e) => setNote(e.detail.value ?? "")}
					onIonBlur={handleNoteBlur}
					placeholder="Add a note…"
					autoGrow
					rows={1}
					className="highlight-modal-note"
				/>
			</IonContent>
		</IonModal>
	);
};

export default HighlightModal;
