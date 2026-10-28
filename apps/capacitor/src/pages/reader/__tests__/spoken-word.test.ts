import { afterEach, describe, expect, it } from "vitest";
import { firstVisibleWordInView } from "../spoken-word";

const box = (left: number, width: number) => new DOMRect(left, 0, width, 800);

function span(word: number, left: number): HTMLElement {
	const el = document.createElement("span");
	el.dataset.word = String(word);
	el.getClientRects = () => [new DOMRect(left, 10, 40, 20)] as unknown as DOMRectList;
	return el;
}

afterEach(() => {
	document.body.innerHTML = "";
});

describe("firstVisibleWordInView", () => {
	it("skips a previous page's words that lie in the gutter beside page mode's clip", () => {
		const view = document.createElement("div");
		view.getBoundingClientRect = () => box(0, 1800);
		const clip = document.createElement("div");
		clip.className = "page-clip";
		clip.getBoundingClientRect = () => box(220, 1360);
		// The previous spread's right column, translated left of the clip.
		clip.append(span(100, 150), span(500, 240), span(501, 300));
		view.append(clip);
		document.body.append(view);

		expect(firstVisibleWordInView(view)).toBe(500);
	});

	it("uses the whole view without a page clip (scroll mode)", () => {
		const view = document.createElement("div");
		view.getBoundingClientRect = () => box(0, 400);
		view.append(span(7, 10), span(8, 60));
		document.body.append(view);

		expect(firstVisibleWordInView(view)).toBe(7);
	});
});
