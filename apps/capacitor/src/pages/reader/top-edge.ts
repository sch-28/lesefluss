/**
 * A line sits on the top edge when it is at most this far below it. The settle
 * rule takes the first word at or below the edge, so a line cut by it would hand
 * the position to the next line.
 */
export const TOP_EDGE_TOLERANCE_PX = 4;

/**
 * How far above the edge a line may sit and still be the top line: fractional
 * line heights leave it a sub-pixel above, as scrollTop is whole pixels.
 */
export const TOP_EDGE_SLACK_PX = 2;

export const isOnTopEdge = (offset: number) =>
	offset >= -TOP_EDGE_SLACK_PX && offset < TOP_EDGE_TOLERANCE_PX;

/** How far to scroll a line `offset` px below the top edge onto it, landing a pixel below. */
export const scrollOntoTopEdge = (offset: number) => Math.floor(offset) - 1;

export const offsetFromTop = (el: HTMLElement, container: HTMLElement) =>
	el.getBoundingClientRect().top - container.getBoundingClientRect().top;

/**
 * The VList item holding `el`, inside the reader's scroll `container`. Read from
 * the DOM rather than getItemOffset: right after a re-measure the cache is ahead
 * of the rendered item tops.
 */
export function listItemOf(el: HTMLElement, container: HTMLElement): HTMLElement | null {
	const inner = container.firstElementChild?.firstElementChild;
	let node: HTMLElement | null = el;
	while (node && node.parentElement !== inner) node = node.parentElement;
	return node;
}

// VList measures paragraphs once per frame, and a slow device (or a covered
// window) paints a frame a second: "still" is counted in frames, never in time.
const STILL_FRAMES = 3;
const STILL_FRAME_BUDGET = 60;

/**
 * Calls `onStill` once `read()` has returned the same value for STILL_FRAMES
 * consecutive frames, or after STILL_FRAME_BUDGET frames regardless. Returns a cancel.
 */
export function whenStill(read: () => string | number | null, onStill: () => void): () => void {
	let last = read();
	let still = 0;
	let frames = 0;
	let rafId = 0;
	const frame = () => {
		const now = read();
		if (now === last) still++;
		else {
			last = now;
			still = 0;
		}
		if (still >= STILL_FRAMES || ++frames >= STILL_FRAME_BUDGET) {
			rafId = 0;
			onStill();
		} else rafId = requestAnimationFrame(frame);
	};
	rafId = requestAnimationFrame(frame);
	return () => cancelAnimationFrame(rafId);
}
