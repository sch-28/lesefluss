/**
 * SelectionOverlay - renders the floating selection toolbar + two drag handles.
 *
 * Positions are set imperatively by `useHighlightSelection.syncHandlePositions`
 * (via the refs passed in), so the JSX is lean - just the shell elements.
 *
 * Rendered in a portal on `document.body` because Ionic's IonPage uses
 * `transform` for page transitions - that breaks `position: fixed` children
 * (they end up relative to the transformed ancestor instead of the viewport),
 * which on desktop (sidebar offset) manifests as a ~220px horizontal offset.
 */

import type React from "react";
import { createPortal } from "react-dom";
import SelectionToolbar, {
	type HighlightColor,
	type SelectionToolbarStep,
} from "./selection-toolbar";

interface Props {
	isSelecting: boolean;
	/** Keeps the selection but hides its chrome, e.g. behind the note sheet. */
	isHidden: boolean;
	step: SelectionToolbarStep;
	isSingleWord: boolean;
	selectionColor: HighlightColor | null;
	toolbarRef: React.RefObject<HTMLDivElement | null>;
	startHandleRef: React.RefObject<HTMLDivElement | null>;
	endHandleRef: React.RefObject<HTMLDivElement | null>;
	onHighlight: () => void;
	onColorChange: (color: HighlightColor) => void;
	onNote: () => void;
	onLookup: () => void;
	onAddToGlossary: () => void;
	onDelete: () => void;
	onComment?: () => void;
	onShare?: () => void;
	onStartHandlePointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
	onEndHandlePointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
}

const SelectionOverlay: React.FC<Props> = ({
	isSelecting,
	isHidden,
	step,
	isSingleWord,
	selectionColor,
	toolbarRef,
	startHandleRef,
	endHandleRef,
	onHighlight,
	onColorChange,
	onNote,
	onLookup,
	onAddToGlossary,
	onDelete,
	onComment,
	onShare,
	onStartHandlePointerDown,
	onEndHandlePointerDown,
}) => {
	return createPortal(
		// `hidden` overrides the handles' inline display, which the hook sets imperatively.
		<div hidden={isHidden}>
			{isSelecting && (
				<SelectionToolbar
					ref={toolbarRef}
					step={step}
					selectedColor={selectionColor}
					isSingleWord={isSingleWord}
					onHighlight={onHighlight}
					onColorChange={onColorChange}
					onNote={onNote}
					onLookup={onLookup}
					onAddToGlossary={onAddToGlossary}
					onDelete={onDelete}
					onComment={onComment}
					onShare={onShare}
				/>
			)}
			<div
				ref={startHandleRef}
				className="selection-handle selection-handle--start"
				style={{ display: "none" }}
				onPointerDown={onStartHandlePointerDown}
			/>
			<div
				ref={endHandleRef}
				className="selection-handle selection-handle--end"
				style={{ display: "none" }}
				onPointerDown={onEndHandlePointerDown}
			/>
		</div>,
		document.body,
	);
};

export default SelectionOverlay;
