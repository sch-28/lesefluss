/**
 * The reading ruler: a band over the line (or lines) holding one word, with
 * the rest of the view dimmed. A visual aid only: it reads rects and moves its
 * own nodes by transform, and never scrolls, turns a page or saves a position.
 * Kept out of React state so a spoken word does not re-render every paragraph.
 */

type Box = { left: number; right: number; top: number; bottom: number };
type Rect = Box & { height: number };

/** Page mode's column grid (PageGeometry), relative to the clip's left edge. */
export type RulerColumns = { stride: number; width: number };

export type RulerBand = { top: number; height: number; left: number; width: number };

/**
 * Where the band goes, in the coordinates of `rects` and `clip`. Uses the
 * fragment whose centre lies in the clip (a word hyphenated across page columns
 * has one per column); null when no fragment is on screen.
 *
 * Two lines are the word's and the next; three put the word's in the middle.
 * Vertically the band stays inside the clip. Horizontally it covers `column`
 * (scroll mode's text block), or with `columns` the page column holding the
 * fragment, so a two-page spread marks one page only.
 */
export function rulerBand(
	rects: readonly Rect[],
	clip: Box,
	column: Box,
	lineHeight: number,
	lines: number,
	columns: RulerColumns | null = null,
): RulerBand | null {
	const rect = rects.find((r) => {
		const x = (r.left + r.right) / 2;
		const y = (r.top + r.bottom) / 2;
		return x >= clip.left && x <= clip.right && y >= clip.top && y <= clip.bottom;
	});
	if (!rect) return null;
	const lineTop = rect.top - (lineHeight - rect.height) / 2;
	const above = lines >= 3 ? 1 : 0;
	const top = Math.max(clip.top, lineTop - above * lineHeight);
	const bottom = Math.min(clip.bottom, lineTop + (Math.max(1, lines) - above) * lineHeight);
	if (columns && columns.stride > 0) {
		const centre = (rect.left + rect.right) / 2;
		const left = clip.left + Math.floor((centre - clip.left) / columns.stride) * columns.stride;
		return { top, height: bottom - top, left, width: columns.width };
	}
	return { top, height: bottom - top, left: column.left, width: column.right - column.left };
}

export type RulerNodes = {
	root: HTMLElement;
	band: HTMLElement;
	dimAbove: HTMLElement;
	dimBelow: HTMLElement;
};

const lineHeightOf = (el: Element): number => {
	const block = el.closest(".reader-paragraph, .reader-heading") ?? el.parentElement;
	const parsed = block ? Number.parseFloat(getComputedStyle(block).lineHeight) : Number.NaN;
	// "normal" has no px value; the element's own height is the line box then.
	return Number.isFinite(parsed) ? parsed : el.getBoundingClientRect().height;
};

/**
 * The element showing `word`: its span, or the heading it belongs to (headings
 * render no word spans; each carries its first word). A heading only counts when
 * no rendered span lies between its first word and `word`.
 */
export function wordElement(view: ParentNode, word: number): HTMLElement | null {
	const span = view.querySelector<HTMLElement>(`span[data-word="${word}"]`);
	if (span) return span;
	let heading: HTMLElement | null = null;
	let headingWord = Number.NEGATIVE_INFINITY;
	for (const el of view.querySelectorAll<HTMLElement>("[data-heading-word]")) {
		const first = Number(el.dataset.headingWord);
		if (first <= word && first > headingWord) {
			heading = el;
			headingWord = first;
		}
	}
	if (!heading) return null;
	for (const el of view.querySelectorAll<HTMLElement>("span[data-word]")) {
		const w = Number(el.dataset.word);
		if (w > headingWord && w <= word) return null;
	}
	return heading;
}

export class ReadingRuler {
	private view: HTMLElement | null = null;
	private nodes: RulerNodes | null = null;
	private word: number | null = null;
	private lines = 1;
	private columns: RulerColumns | null = null;
	private suspended = false;
	/** What is on screen, so a word on the same line writes nothing. */
	private shown: RulerBand | null = null;

	attach(view: HTMLElement | null, nodes: RulerNodes | null): void {
		this.view = view;
		this.nodes = nodes;
		this.shown = null;
		this.place();
	}

	setLines(lines: number): void {
		if (lines === this.lines) return;
		this.lines = lines;
		this.place();
	}

	/** Page mode's column grid; null in scroll mode. */
	setColumns(columns: RulerColumns | null): void {
		const c = this.columns;
		if (c?.stride === columns?.stride && c?.width === columns?.width) return;
		this.columns = columns;
		this.relayout();
	}

	show(word: number | null): void {
		this.word = word;
		this.place();
	}

	/** Hidden while the page moves: mid-slide or mid-chunk-crossing rects are stale. */
	setMoving(moving: boolean): void {
		this.suspended = moving;
		this.place();
	}

	/** Re-measure after scrolling, a resize or a layout setting change. */
	relayout(): void {
		this.shown = null;
		this.place();
	}

	private place(): void {
		const view = this.view;
		const nodes = this.nodes;
		if (!view || !nodes) return;
		const el = this.word === null || this.suspended ? null : wordElement(view, this.word);
		const band = el ? this.bandFor(view, el) : null;
		if (!band) {
			if (this.shown) nodes.root.dataset.visible = "false";
			this.shown = null;
			return;
		}
		const s = this.shown;
		if (
			s &&
			s.top === band.top &&
			s.height === band.height &&
			s.left === band.left &&
			s.width === band.width
		)
			return;
		const appearing = nodes.root.dataset.visible !== "true";
		const parts = [nodes.band, nodes.dimAbove, nodes.dimBelow];
		// Appearing, it is put in place: sliding in from where it last was (or 0,0) reads as motion.
		if (appearing) for (const part of parts) part.style.transition = "none";
		const viewHeight = view.clientHeight;
		// Scroll mode dims the margins too; a spread dims only the marked page.
		const dim = this.columns ? band : { left: 0, width: view.clientWidth };
		nodes.band.style.height = `${band.height}px`;
		nodes.band.style.width = `${band.width}px`;
		nodes.dimAbove.style.width = `${dim.width}px`;
		nodes.dimBelow.style.width = `${dim.width}px`;
		nodes.band.style.transform = `translate(${band.left}px, ${band.top}px)`;
		nodes.dimAbove.style.transform = `translate(${dim.left}px, ${band.top - viewHeight}px)`;
		nodes.dimBelow.style.transform = `translate(${dim.left}px, ${band.top + band.height}px)`;
		nodes.root.dataset.visible = "true";
		if (appearing) {
			void nodes.root.offsetWidth;
			for (const part of parts) part.style.transition = "";
		}
		this.shown = band;
	}

	private bandFor(view: HTMLElement, el: HTMLElement): RulerBand | null {
		const origin = view.getBoundingClientRect();
		const rel = (r: Box) => ({
			left: r.left - origin.left,
			right: r.right - origin.left,
			top: r.top - origin.top,
			bottom: r.bottom - origin.top,
		});
		const pageClip = view.querySelector(".page-clip");
		const clip = rel((pageClip ?? view).getBoundingClientRect());
		// Scroll mode's column is the text block; page mode's comes from `columns`.
		const column = pageClip
			? clip
			: rel((el.closest(".reader-paragraph, .reader-heading") ?? el).getBoundingClientRect());
		const rects = [...el.getClientRects()].map((r) => ({ ...rel(r), height: r.height }));
		const band = rulerBand(
			rects,
			clip,
			column,
			lineHeightOf(el),
			this.lines,
			pageClip ? this.columns : null,
		);
		if (!band) return null;
		// Edges rounded, not sizes: a rounded height drifts a pixel from the lines it covers.
		const top = Math.round(band.top);
		const left = Math.round(band.left);
		return {
			top,
			height: Math.round(band.top + band.height) - top,
			left,
			width: Math.round(band.left + band.width) - left,
		};
	}
}
