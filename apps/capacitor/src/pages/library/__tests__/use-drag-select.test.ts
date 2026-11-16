import { afterEach, describe, expect, it } from "vitest";
import { bookIdAt, edgeScrollStep } from "../use-drag-select";

describe("edgeScrollStep", () => {
	it("scrolls up near the top, down near the bottom, and not in between", () => {
		expect(edgeScrollStep(110, 100, 900)).toBeLessThan(0);
		expect(edgeScrollStep(890, 100, 900)).toBeGreaterThan(0);
		expect(edgeScrollStep(500, 100, 900)).toBe(0);
	});
});

describe("bookIdAt", () => {
	const original = document.elementFromPoint;
	afterEach(() => {
		document.elementFromPoint = original;
		document.body.innerHTML = "";
	});

	it("finds the card under the point from any element inside it", () => {
		document.body.innerHTML = '<button data-book-id="b7"><span id="title">T</span></button>';
		document.elementFromPoint = () => document.getElementById("title");
		expect(bookIdAt(1, 1)).toBe("b7");
	});

	it("is null over the gaps between cards", () => {
		document.body.innerHTML = '<div id="gap"></div>';
		document.elementFromPoint = () => document.getElementById("gap");
		expect(bookIdAt(1, 1)).toBeNull();
	});
});
