/**
 * DOM measurement helpers for paginated chunks.
 *
 * These read from the multicol container after layout to convert between
 * word positions (the canonical position model, ADR-0002) and page indices
 * (the layout model). Both functions only do reads; calling them in
 * succession from the same synchronous frame triggers a single browser
 * layout flush.
 */

import type { WordPosition } from "@lesefluss/core";

/** Find the page index containing the span with the exact data-word, or the
 *  closest one ≤ wordIdx. Returns 0 if no span found (empty chunk / stale
 *  saved position past the chunk's last word). */
export function findPageForWord(
	columns: HTMLElement,
	pageWidth: number,
	pageCount: number,
	wordIdx: WordPosition,
): number {
	const exact = columns.querySelector<HTMLElement>(`span[data-word="${wordIdx}"]`);
	let span: HTMLElement | null = exact;
	if (!span) {
		let bestW: number | null = null;
		for (const s of columns.querySelectorAll<HTMLElement>("span[data-word]")) {
			const w = Number.parseInt(s.dataset.word ?? "", 10);
			if (Number.isNaN(w) || w < 0 || w > wordIdx) continue;
			if (bestW === null || w > bestW) {
				bestW = w;
				span = s;
			}
		}
	}
	if (!span) return 0;
	const colsRect = columns.getBoundingClientRect();
	const spanRect = span.getBoundingClientRect();
	const xWithinContent = spanRect.left - colsRect.left;
	const page = Math.floor(xWithinContent / pageWidth);
	return Math.max(0, Math.min(pageCount - 1, page));
}

/** Returns the word index of the topmost-leftmost word span on the given
 *  page index. Null if no spans on this page (empty chunk). */
export function readFirstVisibleWord(
	columns: HTMLElement,
	pageWidth: number,
	pageIndex: number,
): number | null {
	const colsRect = columns.getBoundingClientRect();
	const targetXMax = (pageIndex + 1) * pageWidth;
	let best: { word: number; top: number; left: number } | null = null;
	for (const s of columns.querySelectorAll<HTMLElement>("span[data-word]")) {
		const r = s.getBoundingClientRect();
		const xWithin = r.left - colsRect.left;
		if (best && xWithin >= targetXMax) break;
		const onThisPage = Math.floor(xWithin / pageWidth) === pageIndex;
		if (!onThisPage) continue;
		const w = Number.parseInt(s.dataset.word ?? "", 10);
		if (Number.isNaN(w) || w < 0) continue;
		if (!best || r.top < best.top || (r.top === best.top && r.left < best.left)) {
			best = { word: w, top: r.top, left: r.left };
		}
	}
	return best?.word ?? null;
}
