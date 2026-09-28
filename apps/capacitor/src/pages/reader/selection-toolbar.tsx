/**
 * SelectionToolbar: floating bar for a selection. "actions" is an unsaved
 * selection, "styled" a saved highlight (new or existing). There is no close
 * button: tapping outside dismisses, and a saved highlight stays saved.
 */

import {
	BookMarked,
	Highlighter,
	type LucideIcon,
	MessageSquarePlus,
	Search,
	Share2,
	StickyNote,
	Trash2,
} from "lucide-react";
import React from "react";

export const HIGHLIGHT_COLORS = ["yellow", "blue", "orange", "pink"] as const;
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];

export const HIGHLIGHT_COLOR_STYLE: Record<HighlightColor, string> = {
	yellow: "#FFEB3B",
	blue: "#64B5F6",
	orange: "#FFB74D",
	pink: "#F06292",
};

const SWATCH_STYLE = Object.fromEntries(
	HIGHLIGHT_COLORS.map((c) => [c, { "--swatch": HIGHLIGHT_COLOR_STYLE[c] } as React.CSSProperties]),
) as Record<HighlightColor, React.CSSProperties>;

export type SelectionToolbarStep = "actions" | "styled";

interface SelectionToolbarProps {
	step: SelectionToolbarStep;
	selectedColor: HighlightColor | null;
	/** Look up takes one word, so it is disabled (not hidden, to keep the bar steady) for phrases. */
	isSingleWord: boolean;
	onHighlight: () => void;
	onColorChange: (color: HighlightColor) => void;
	onNote: () => void;
	onLookup: () => void;
	onAddToGlossary: () => void;
	onDelete: () => void;
	/** Present only while the book is in a buddy read. */
	onComment?: () => void;
	/** Present only while the book is in a buddy read. */
	onShare?: () => void;
}

interface ActionProps {
	icon: LucideIcon;
	label: string;
	onClick: () => void;
	disabled?: boolean;
	destructive?: boolean;
}

function Action({ icon: Icon, label, onClick, disabled, destructive }: ActionProps) {
	return (
		<button
			type="button"
			className={
				destructive
					? "selection-toolbar-action selection-toolbar-action--destructive"
					: "selection-toolbar-action"
			}
			onClick={onClick}
			disabled={disabled}
		>
			<Icon className="size-5" aria-hidden="true" />
			<span>{label}</span>
		</button>
	);
}

const SelectionToolbar = React.forwardRef<HTMLDivElement, SelectionToolbarProps>(
	(
		{
			step,
			selectedColor,
			isSingleWord,
			onHighlight,
			onColorChange,
			onNote,
			onLookup,
			onAddToGlossary,
			onDelete,
			onComment,
			onShare,
		},
		ref,
	) => {
		if (step === "actions") {
			return (
				<div ref={ref} className="selection-toolbar" role="toolbar" aria-label="Selection">
					<Action icon={Highlighter} label="Highlight" onClick={onHighlight} />
					<Action icon={StickyNote} label="Note" onClick={onNote} />
					<Action icon={Search} label="Look up" onClick={onLookup} disabled={!isSingleWord} />
					<Action icon={BookMarked} label="Glossary" onClick={onAddToGlossary} />
					{onComment && <Action icon={MessageSquarePlus} label="Comment" onClick={onComment} />}
				</div>
			);
		}

		return (
			<div ref={ref} className="selection-toolbar" role="toolbar" aria-label="Highlight">
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
							style={SWATCH_STYLE[color]}
							onClick={() => onColorChange(color)}
							aria-label={`Highlight ${color}`}
							aria-pressed={selectedColor === color}
						/>
					))}
				</div>
				<div className="selection-toolbar-divider" />
				<Action icon={StickyNote} label="Note" onClick={onNote} />
				{onShare && <Action icon={Share2} label="Share" onClick={onShare} />}
				<Action icon={Trash2} label="Delete" onClick={onDelete} destructive />
			</div>
		);
	},
);

export default SelectionToolbar;
