/**
 * SelectionToolbar - floating bar shown during text selection.
 *
 * Auto-saves: picking a color triggers an immediate save in the parent.
 * No confirm button - the X just closes the toolbar.
 */

import { IonIcon } from "@ionic/react";
import { closeOutline, createOutline, searchOutline } from "ionicons/icons";
import React from "react";

export const HIGHLIGHT_COLORS = ["yellow", "blue", "orange", "pink"] as const;
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];

export const HIGHLIGHT_COLOR_STYLE: Record<HighlightColor, string> = {
	yellow: "#FFEB3B",
	blue: "#64B5F6",
	orange: "#FFB74D",
	pink: "#F06292",
};

interface SelectionToolbarProps {
	/** null = no color picked yet - nothing shows as active */
	selectedColor: HighlightColor | null;
	/** True when the selection covers exactly one word — only then does the
	 *  "Look up" button make sense (dictionary takes one word, not phrases). */
	isSingleWord: boolean;
	onColorChange: (color: HighlightColor) => void;
	onNote: () => void;
	onLookup: () => void;
	onCancel: () => void;
}

const SelectionToolbar = React.forwardRef<HTMLDivElement, SelectionToolbarProps>(
	({ selectedColor, isSingleWord, onColorChange, onNote, onLookup, onCancel }, ref) => {
		return (
			<div ref={ref} className="selection-toolbar">
				<div className="selection-toolbar-colors">
					{HIGHLIGHT_COLORS.map((color) => (
						<button
							key={color}
							type="button"
							className={
								selectedColor === color
									? "selection-color-swatch selection-color-swatch--active"
									: "selection-color-swatch"
							}
							style={{ background: HIGHLIGHT_COLOR_STYLE[color] }}
							onClick={() => onColorChange(color)}
							aria-label={`Highlight ${color}`}
						/>
					))}
				</div>
				{isSingleWord && (
					<button
						type="button"
						className="selection-toolbar-btn"
						onClick={onLookup}
						aria-label="Look up word"
					>
						<IonIcon icon={searchOutline} />
					</button>
				)}
				<button
					type="button"
					className="selection-toolbar-btn"
					onClick={onNote}
					aria-label="Add note"
				>
					<IonIcon icon={createOutline} />
				</button>
				<button
					type="button"
					className="selection-toolbar-btn"
					onClick={onCancel}
					aria-label="Cancel selection"
				>
					<IonIcon icon={closeOutline} />
				</button>
			</div>
		);
	},
);

export default SelectionToolbar;
