/**
 * A word hyphenated across lines (or page columns) has one client rect per
 * fragment; its bounding box spans both and sits on neither.
 */
export function firstLineRect(el: Element): DOMRect {
	const rects = el.getClientRects();
	return rects.length > 0 ? rects[0] : el.getBoundingClientRect();
}

export function lastLineRect(el: Element): DOMRect {
	const rects = el.getClientRects();
	return rects.length > 0 ? rects[rects.length - 1] : el.getBoundingClientRect();
}
