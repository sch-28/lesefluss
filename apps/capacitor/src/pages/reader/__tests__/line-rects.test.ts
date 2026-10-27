import { describe, expect, it } from "vitest";
import { firstLineRect, lastLineRect } from "../line-rects";

const rect = (left: number, top: number) => new DOMRect(left, top, 40, 20);

function spanWith(rects: DOMRect[], box: DOMRect): HTMLElement {
	const span = document.createElement("span");
	span.getClientRects = () => rects as unknown as DOMRectList;
	span.getBoundingClientRect = () => box;
	return span;
}

describe("line rects", () => {
	it("give a hyphen-split word's first and last fragment, not the box spanning both lines", () => {
		const head = rect(300, 100);
		const tail = rect(0, 130);
		const span = spanWith([head, tail], new DOMRect(0, 100, 340, 50));

		expect(firstLineRect(span)).toBe(head);
		expect(lastLineRect(span)).toBe(tail);
	});

	it("fall back to the bounding box when the word has no fragments", () => {
		const box = rect(10, 10);
		const span = spanWith([], box);

		expect(firstLineRect(span)).toBe(box);
		expect(lastLineRect(span)).toBe(box);
	});
});
