import { firstLineRect } from "./line-rects";

const HIGHLIGHT_NAME = "tts-word";

/**
 * Marks the word being spoken with a CSS custom highlight, outside React: the
 * reader would otherwise re-render every visible paragraph a few times a
 * second. Called per word, so a paragraph the virtual list remounts picks the
 * mark up again on the next word.
 */
export function markSpokenWord(word: number | null): void {
	if (typeof CSS === "undefined" || !("highlights" in CSS)) return;
	const span = word === null ? null : document.querySelector(`span[data-word="${word}"]`);
	if (!span?.firstChild) {
		CSS.highlights.delete(HIGHLIGHT_NAME);
		return;
	}
	const range = document.createRange();
	range.selectNodeContents(span);
	CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(range));
}

/** The first word span inside `root`'s visible box, in reading order. */
export function firstVisibleWord(root: Element): number | null {
	const box = root.getBoundingClientRect();
	for (const span of root.querySelectorAll<HTMLElement>("span[data-word]")) {
		const r = firstLineRect(span);
		if (r.bottom > box.top && r.top < box.bottom && r.right > box.left && r.left < box.right) {
			const word = Number.parseInt(span.dataset.word ?? "", 10);
			if (!Number.isNaN(word)) return word;
		}
	}
	return null;
}
