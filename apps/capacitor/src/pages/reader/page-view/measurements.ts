/**
 * DOM measurement helpers for paginated chunks. Read from the multicol
 * container after layout to convert between word positions and page
 * indices. Both functions only do reads; calling them in succession from
 * the same synchronous frame triggers a single browser layout flush.
 */

import { firstLineRect } from "../line-rects";

/** A word span, or a heading, which renders no spans and carries its first word. */
const WORD_TARGETS = "span[data-word], [data-heading-word]";

const wordOf = (el: HTMLElement) =>
	Number.parseInt(el.dataset.word ?? el.dataset.headingWord ?? "", 10);

/** Find the page index containing the word span or heading for wordIdx, or the
 *  closest one ≤ wordIdx. Returns 0 if no span found (empty chunk / stale
 *  saved position past the chunk's last word). */
export function findPageForWord(
	columns: HTMLElement,
	pageWidth: number,
	pageCount: number,
	wordIdx: number,
): number {
	const exact = columns.querySelector<HTMLElement>(
		`span[data-word="${wordIdx}"], [data-heading-word="${wordIdx}"]`,
	);
	let span: HTMLElement | null = exact;
	if (!span) {
		let bestW: number | null = null;
		for (const s of columns.querySelectorAll<HTMLElement>(WORD_TARGETS)) {
			const w = wordOf(s);
			if (Number.isNaN(w) || w < 0 || w > wordIdx) continue;
			if (bestW === null || w > bestW) {
				bestW = w;
				span = s;
			}
		}
	}
	if (!span) return 0;
	const colsRect = columns.getBoundingClientRect();
	// Center-x of the first line rect stays safely inside the column even when
	// getBoundingClientRect reports a sub-pixel underflow at the column boundary.
	const r0 = firstLineRect(span);
	const xCenter = r0.left + r0.width / 2 - colsRect.left;
	const page = Math.floor(xCenter / pageWidth);
	return Math.max(0, Math.min(pageCount - 1, page));
}

/** Word index of the topmost-leftmost word span or heading on the page, or null
 *  when the page holds no words (a figure page, or past the end).
 *
 *  Invariant: a span's page never decreases in DOM order, because columns fill
 *  in order and spans and headings flow in it (no floats or positioning).
 *  That lets a binary search find the page's first span. */
export function readFirstVisibleWord(
	columns: HTMLElement,
	pageWidth: number,
	pageIndex: number,
): number | null {
	const colsRect = columns.getBoundingClientRect();
	const spans = columns.querySelectorAll<HTMLElement>(WORD_TARGETS);
	const pageOfRect = (r: DOMRect) => Math.floor((r.left + r.width / 2 - colsRect.left) / pageWidth);
	let lo = 0;
	let hi = spans.length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (pageOfRect(firstLineRect(spans[mid])) < pageIndex) lo = mid + 1;
		else hi = mid;
	}
	let best: { word: number; top: number; left: number } | null = null;
	for (let i = lo; i < spans.length; i++) {
		const r = firstLineRect(spans[i]);
		if (pageOfRect(r) !== pageIndex) break;
		const w = wordOf(spans[i]);
		if (Number.isNaN(w) || w < 0) continue;
		if (!best || r.top < best.top || (r.top === best.top && r.left < best.left)) {
			best = { word: w, top: r.top, left: r.left };
		}
	}
	return best?.word ?? null;
}
