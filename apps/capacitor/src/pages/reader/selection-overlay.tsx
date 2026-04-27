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
import SelectionToolbar, { type HighlightColor } from "./selection-toolbar";

interface Props {
	isSelecting: boolean;
	isSingleWord: boolean;
	selectionColor: HighlightColor | null;
	toolbarRef: React.RefObject<HTMLDivElement | null>;
	startHandleRef: React.RefObject<HTMLDivElement | null>;
	endHandleRef: React.RefObject<HTMLDivElement | null>;
	onColorChange: (color: HighlightColor) => void;
	onNote: () => void;
	onLookup: () => void;
	onCancel: () => void;
	onStartHandlePointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
	onEndHandlePointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
}

const SelectionOverlay: React.FC<Props> = ({
	isSelecting,
	isSingleWord,
	selectionColor,
	toolbarRef,
	startHandleRef,
	endHandleRef,
	onColorChange,
	onNote,
	onLookup,
	onCancel,
	onStartHandlePointerDown,
	onEndHandlePointerDown,
}) => {
	return createPortal(
		<>
			{isSelecting && (
				<SelectionToolbar
					ref={toolbarRef}
					selectedColor={selectionColor}
					isSingleWord={isSingleWord}
					onColorChange={onColorChange}
					onNote={onNote}
					onLookup={onLookup}
					onCancel={onCancel}
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
		</>,
		document.body,
	);
};

export default SelectionOverlay;
