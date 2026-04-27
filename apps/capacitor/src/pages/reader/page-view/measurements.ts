/**
 * DOM measurement helpers for paginated chunks.
 *
 * These read from the multicol container after layout to convert between
 * byte offsets (the position model) and page indices (the layout model).
 * Both functions only do reads; calling them in succession from the same
 * synchronous frame triggers a single browser layout flush (subsequent
 * getBoundingClientRect calls are served from the same layout cache).
 */

/** Find the page index containing the span with the exact data-offset, or the
 *  closest one ≤ byteOffset. Returns 0 if no span found (empty chunk / stale
 *  offset past the chunk's last word). */
export function findPageForByte(
	columns: HTMLElement,
	pageWidth: number,
	pageCount: number,
	byteOffset: number,
): number {
	const exact = columns.querySelector<HTMLElement>(`span[data-offset="${byteOffset}"]`);
	let span: HTMLElement | null = exact;
	if (!span) {
		// Fallback: largest data-offset ≤ byteOffset (handles stale saved positions).
		let bestOff = -1;
		for (const s of columns.querySelectorAll<HTMLElement>("span[data-offset]")) {
			const off = Number.parseInt(s.dataset.offset ?? "", 10);
			if (Number.isNaN(off) || off > byteOffset) continue;
			if (off > bestOff) {
				bestOff = off;
				span = s;
			}
		}
	}
	if (!span) return 0;
	const colsRect = columns.getBoundingClientRect();
	const spanRect = span.getBoundingClientRect();
	// Both rects shift together under any transform on a shared ancestor →
	// the difference is the untranslated x within the columns content.
	const xWithinContent = spanRect.left - colsRect.left;
	const page = Math.floor(xWithinContent / pageWidth);
	return Math.max(0, Math.min(pageCount - 1, page));
}

/** Returns the byte offset of the topmost-leftmost word span on the given
 *  page index. Null if no spans on this page (empty chunk). Spans are walked
 *  in source order, which roughly matches column-flow order — so we exit
 *  early once we've moved past the page (avoids walking the whole chunk
 *  when the user is on an early page). */
export function readFirstVisibleByteOffset(
	columns: HTMLElement,
	pageWidth: number,
	pageIndex: number,
): number | null {
	const colsRect = columns.getBoundingClientRect();
	const targetXMax = (pageIndex + 1) * pageWidth;
	let best: { off: number; top: number; left: number } | null = null;
	for (const s of columns.querySelectorAll<HTMLElement>("span[data-offset]")) {
		const r = s.getBoundingClientRect();
		const xWithin = r.left - colsRect.left;
		if (best && xWithin >= targetXMax) break;
		const onThisPage = Math.floor(xWithin / pageWidth) === pageIndex;
		if (!onThisPage) continue;
		const off = Number.parseInt(s.dataset.offset ?? "", 10);
		if (Number.isNaN(off)) continue;
		if (!best || r.top < best.top || (r.top === best.top && r.left < best.left)) {
			best = { off, top: r.top, left: r.left };
		}
	}
	return best?.off ?? null;
}
