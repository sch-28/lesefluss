export interface WordRect {
	top: number;
	bottom: number;
	left: number;
	right: number;
}

export interface ToolbarPositionInput {
	startRect: WordRect;
	endRect: WordRect;
	toolbar: { width: number; height: number };
	viewport: { width: number; height: number };
	safeTop: number;
	safeBottom: number;
}

const EDGE = 12;
const GAP = 4;
// Must match .selection-handle in monochrome.css: 10px of hit-area padding above
// and below, and a 20px circle under the word's bar.
export const HANDLE_V_PAD = 10;
const HANDLE_CIRCLE = 20;
const HANDLE_REACH_ABOVE = HANDLE_V_PAD;
const HANDLE_REACH_BELOW = HANDLE_CIRCLE + HANDLE_V_PAD;

/**
 * Above the first selected line, else below the end handle, else pinned to the
 * bottom of the screen. Never overlaps a handle's hit area unless pinned.
 */
export function computeToolbarPosition({
	startRect,
	endRect,
	toolbar,
	viewport,
	safeTop,
	safeBottom,
}: ToolbarPositionInput): { top: number; left: number } {
	const minTop = safeTop + EDGE;
	const maxTop = viewport.height - safeBottom - EDGE - toolbar.height;

	const above = startRect.top - HANDLE_REACH_ABOVE - GAP - toolbar.height;
	const below = endRect.bottom + HANDLE_REACH_BELOW + GAP;
	let top: number;
	if (above >= minTop) top = above;
	else if (below <= maxTop) top = below;
	else top = maxTop;

	const centre =
		(Math.min(startRect.left, endRect.left) + Math.max(startRect.right, endRect.right)) / 2;
	const maxLeft = viewport.width - EDGE - toolbar.width;
	const left = Math.max(EDGE, Math.min(maxLeft, centre - toolbar.width / 2));

	return { top, left };
}
