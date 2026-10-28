import type { Page } from "@playwright/test";

/**
 * Text under `rootSelector` that does not fit:
 * - off screen: a line runs past the viewport's sides, unless it sits in a
 *   horizontal scroll strip;
 * - spills: a line runs out of its button or link (vertically by more than a
 *   quarter line: a glyph's content area may poke past a padless box unseen);
 * - clipped: a line is cut by an overflow-hidden/clip box, on any side;
 * - overlap: two lines are drawn over each other;
 * - truncated: ellipsis or line-clamp hides more than half of the text.
 * A box marked `data-clips-text` cuts or truncates on purpose (a preview
 * window, a title that yields to actions); text inside it is not counted.
 * Measures each line of text, not boxes, since text can overflow a box that
 * itself fits. Skipped as not on screen: text a scroll container has scrolled
 * out of view (along the axis it scrolls), text under a fixed or sticky header
 * or tab bar, text folded into a closed <details>, and visually hidden text
 * for screen readers (sr-only: a box of 1px or less that clips its overflow).
 */
export function textLayoutProblems(page: Page, rootSelector = "body"): Promise<string[]> {
	return page.evaluate(async (rootSelector) => {
		await document.fonts.ready;
		const root = document.querySelector(rootSelector);
		if (!root) return [`no ${rootSelector}`];
		const problems: string[] = [];
		const viewportWidth = window.innerWidth;
		const style = (el: Element) => getComputedStyle(el);
		const isScroll = (overflow: string) => overflow === "auto" || overflow === "scroll";
		const outside = (r: DOMRect, b: DOMRect, axis: "x" | "y") =>
			axis === "x"
				? r.right <= b.left || r.left >= b.right
				: r.bottom <= b.top || r.top >= b.bottom;
		const spills = (r: DOMRect, b: DOMRect) => {
			const slack = Math.max(1, r.height / 4);
			return (
				r.left < b.left - 1 ||
				r.right > b.right + 1 ||
				r.top < b.top - slack ||
				r.bottom > b.bottom + slack
			);
		};

		const bars = [...document.querySelectorAll("nav, header")]
			.map((bar) => {
				for (let e: Element | null = bar; e; e = e.parentElement) {
					if (["fixed", "sticky"].includes(style(e).position)) return { bar, box: e };
				}
				return null;
			})
			.filter((b): b is { bar: Element; box: Element } => {
				if (!b) return false;
				const r = b.box.getBoundingClientRect();
				return r.width > 0 && r.height > 0;
			});
		const underBar = (r: DOMRect, el: Element) =>
			bars.some(({ box }) => {
				if (box.contains(el)) return false;
				const b = box.getBoundingClientRect();
				return !outside(r, b, "x") && !outside(r, b, "y");
			});

		const isShown = (el: Element) => {
			if (el.closest("details:not([open]) > :not(summary)")) return false;
			for (let e: Element | null = el; e; e = e.parentElement) {
				const s = style(e);
				if (s.display === "none" || s.visibility === "hidden" || s.opacity === "0") return false;
				const box = e.getBoundingClientRect();
				const clips = s.overflow !== "visible" || s.clip !== "auto" || s.clipPath !== "none";
				if (clips && (box.width <= 1 || box.height <= 1)) return false;
			}
			return true;
		};
		const isHorizontalStrip = (e: Element) => {
			const s = style(e);
			return (
				isScroll(s.overflowX) &&
				e.scrollWidth > e.clientWidth &&
				(s.overflowY === "hidden" || e.scrollHeight <= e.clientHeight + 1)
			);
		};
		const isVerticalScroller = (e: Element) =>
			isScroll(style(e).overflowY) && e.scrollHeight > e.clientHeight + 1;
		// Out of view inside a scroller, along the axis it scrolls: checked once scrolled to.
		const isScrolledAway = (r: DOMRect, el: Element) => {
			for (let e: Element | null = el; e; e = e.parentElement) {
				const b = e.getBoundingClientRect();
				if (isVerticalScroller(e) && outside(r, b, "y")) return true;
				if (isHorizontalStrip(e) && outside(r, b, "x")) return true;
			}
			return false;
		};
		const inStrip = (el: Element) => {
			for (let e: Element | null = el; e; e = e.parentElement)
				if (isHorizontalStrip(e)) return true;
			return false;
		};
		const truncation = (el: Element): Element | null => {
			for (let e: Element | null = el; e; e = e.parentElement) {
				const s = style(e);
				if (s.textOverflow === "ellipsis" || s.webkitLineClamp !== "none") return e;
			}
			return null;
		};

		type Run = { el: HTMLElement; rect: DOMRect; label: string };
		const runs: Run[] = [];
		const truncated = new Set<Element>();
		const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
		for (let node = walker.nextNode(); node; node = walker.nextNode()) {
			const text = node.textContent?.trim();
			const el = node.parentElement;
			if (!text || !el || !isShown(el) || el.closest("[data-clips-text]")) continue;
			const label = `"${text.slice(0, 24)}" in ${el.tagName.toLowerCase()}`;
			const cut = truncation(el);
			if (cut) {
				if (!truncated.has(cut)) {
					truncated.add(cut);
					const isClamp = style(cut).webkitLineClamp !== "none";
					const shown = isClamp
						? cut.clientHeight / cut.scrollHeight
						: cut.clientWidth / cut.scrollWidth;
					if (shown < 0.5) problems.push(`truncated to ${Math.round(shown * 100)}%: ${label}`);
				}
				continue;
			}
			const range = document.createRange();
			range.selectNodeContents(node);
			// One rect per line: a wrapped run's bounding box would cover its neighbours.
			for (const rect of range.getClientRects()) {
				if (rect.width === 0 || rect.height === 0) continue;
				if (underBar(rect, el) || isScrolledAway(rect, el)) continue;
				runs.push({ el, rect, label });
			}
		}

		const clipped = new Set<Element>();
		for (const { el, rect, label } of runs) {
			const control = el.closest("button, a, [role='button'], [role='radio']");
			if (control && spills(rect, control.getBoundingClientRect())) {
				problems.push(`spills out of its control: ${label}`);
			}
			if ((rect.right > viewportWidth + 1 || rect.left < -1) && !inStrip(el)) {
				problems.push(`off screen: ${label} (${Math.round(rect.left)}..${Math.round(rect.right)})`);
			}
			// Boxes above the nearest scroller cut only what it has scrolled: that is scrolling.
			for (let e: Element | null = el; e && e !== root.parentElement; e = e.parentElement) {
				const s = style(e);
				if (isScroll(s.overflowX) || isScroll(s.overflowY)) break;
				const clips = ["hidden", "clip"];
				if (!clips.includes(s.overflowX) && !clips.includes(s.overflowY)) continue;
				if (spills(rect, e.getBoundingClientRect())) {
					if (!clipped.has(e)) problems.push(`clipped: ${label}`);
					clipped.add(e);
					break;
				}
			}
		}
		for (let i = 0; i < runs.length; i++) {
			for (let j = i + 1; j < runs.length; j++) {
				// A run's own lines may touch under tight leading; that is not a collision.
				if (runs[i].el === runs[j].el) continue;
				const a = runs[i].rect;
				const b = runs[j].rect;
				const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
				const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
				if (x > 2 && y > 2) problems.push(`overlap: ${runs[i].label} / ${runs[j].label}`);
			}
		}
		return problems;
	}, rootSelector);
}

/**
 * textLayoutProblems at every scroll position of the page's main scroller, so
 * rows that start out under the tab bar are checked too.
 */
export async function textLayoutProblemsWhileScrolling(page: Page): Promise<string[]> {
	const problems = new Set<string>();
	for (let step = 0; step < 30; step++) {
		for (const problem of await textLayoutProblems(page)) problems.add(problem);
		const moved = await page.evaluate(async () => {
			const scroller = [...document.querySelectorAll<HTMLElement>("*")]
				.filter(
					(el) =>
						el.scrollHeight > el.clientHeight + 1 &&
						["auto", "scroll"].includes(getComputedStyle(el).overflowY),
				)
				.sort((a, b) => b.clientHeight * b.clientWidth - a.clientHeight * a.clientWidth)[0];
			if (!scroller) return false;
			const before = scroller.scrollTop;
			scroller.scrollTop += scroller.clientHeight * 0.6;
			// Two frames: virtualised lists mount what scrolled in on the next one.
			for (let i = 0; i < 2; i++) await new Promise((resolve) => requestAnimationFrame(resolve));
			return scroller.scrollTop !== before;
		});
		if (!moved) break;
	}
	return [...problems];
}
