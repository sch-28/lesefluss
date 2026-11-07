import { describe, expect, it } from "vitest";
import { type WordBox, wordOnAdjacentLine } from "../text-lines";

const box = (index: number, top: number, left: number, width = 40): WordBox => ({
	index,
	top,
	left,
	width,
});

// Three lines: words 0-2, 3-4 (a long word), 5-7.
const boxes = [
	box(0, 0, 0),
	box(1, 0, 50),
	box(2, 0, 100),
	box(3, 20, 0, 95),
	box(4, 20, 100),
	box(5, 40, 0),
	box(6, 40, 50),
	box(7, 40, 100),
];

describe("wordOnAdjacentLine", () => {
	it("picks the word under the current one on the next line", () => {
		expect(wordOnAdjacentLine(boxes, 6, 1)).toBe(null);
		expect(wordOnAdjacentLine(boxes, 1, 1)).toBe(3);
		expect(wordOnAdjacentLine(boxes, 2, 1)).toBe(4);
	});

	it("picks the nearest word on the line above", () => {
		expect(wordOnAdjacentLine(boxes, 4, -1)).toBe(2);
		expect(wordOnAdjacentLine(boxes, 3, -1)).toBe(1);
		expect(wordOnAdjacentLine(boxes, 6, -1)).toBe(3);
	});

	it("has nothing past the first or last line, or for a word it does not hold", () => {
		expect(wordOnAdjacentLine(boxes, 0, -1)).toBe(null);
		expect(wordOnAdjacentLine(boxes, 7, 1)).toBe(null);
		expect(wordOnAdjacentLine(boxes, 99, 1)).toBe(null);
	});
});
