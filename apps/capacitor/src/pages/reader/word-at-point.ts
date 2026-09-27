/**
 * Word index of the `span[data-word]` under a viewport point.
 * elementsFromPoint, not elementFromPoint: selection handles and the toolbar
 * sit above the text and would otherwise hide the word beneath them.
 */
export function wordIndexAt(x: number, y: number): number | null {
	for (const el of document.elementsFromPoint(x, y)) {
		const span = el.closest<HTMLElement>("span[data-word]");
		if (span) {
			const idx = Number.parseInt(span.dataset.word ?? "", 10);
			return Number.isNaN(idx) ? null : idx;
		}
	}
	return null;
}
