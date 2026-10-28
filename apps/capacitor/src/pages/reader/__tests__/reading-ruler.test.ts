import { describe, expect, it } from "vitest";
import { ReadingRuler, rulerBand, wordElement } from "../reading-ruler";

const rect = (left: number, top: number, width = 40, height = 20) => ({
	left,
	right: left + width,
	top,
	bottom: top + height,
	height,
});
const clip = { left: 0, right: 400, top: 0, bottom: 800 };
const column = { left: 20, right: 380, top: 0, bottom: 800 };

describe("rulerBand", () => {
	// A 20px glyph box centred in a 30px line: the line starts 5px above it.
	it("covers the word's line", () => {
		expect(rulerBand([rect(10, 100)], clip, column, 30, 1)).toEqual({
			top: 95,
			height: 30,
			left: 20,
			width: 360,
		});
	});

	it("adds the next line for two", () => {
		expect(rulerBand([rect(10, 100)], clip, column, 30, 2)).toMatchObject({ top: 95, height: 60 });
	});

	it("centres the word's line for three", () => {
		expect(rulerBand([rect(10, 100)], clip, column, 30, 3)).toMatchObject({ top: 65, height: 90 });
	});

	it("uses the fragment on the current page for a word split across columns", () => {
		const offPage = rect(420, 700);
		const onPage = rect(10, 100);
		expect(rulerBand([offPage, onPage], clip, column, 30, 1)).toMatchObject({
			top: 95,
			height: 30,
		});
	});

	it("stays inside the clip at a page edge", () => {
		expect(rulerBand([rect(10, 4)], clip, column, 30, 3)).toMatchObject({ top: 0, height: 59 });
		expect(rulerBand([rect(10, 780)], clip, column, 30, 2)).toMatchObject({
			top: 775,
			height: 25,
		});
	});

	it("marks only the page column of a spread that holds the word", () => {
		const columns = { stride: 210, width: 180 };
		expect(rulerBand([rect(250, 100)], clip, clip, 30, 1, columns)).toMatchObject({
			left: 210,
			width: 180,
		});
		expect(rulerBand([rect(30, 100)], clip, clip, 30, 1, columns)).toMatchObject({
			left: 0,
			width: 180,
		});
	});

	it("is null when no fragment is on screen", () => {
		expect(rulerBand([rect(420, 100)], clip, column, 30, 1)).toBeNull();
		expect(rulerBand([], clip, column, 30, 1)).toBeNull();
	});
});

/** A reader view with one paragraph of words laid out at fixed boxes. */
function view(words: Record<number, { left: number; top: number }>) {
	const root = document.createElement("div");
	Object.defineProperty(root, "clientHeight", { value: 800 });
	Object.defineProperty(root, "clientWidth", { value: 400 });
	root.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 0, width: 400, height: 800 });
	const paragraph = document.createElement("p");
	paragraph.className = "reader-paragraph";
	paragraph.style.lineHeight = "30px";
	paragraph.getBoundingClientRect = () =>
		DOMRect.fromRect({ x: 20, y: 0, width: 360, height: 800 });
	for (const [word, box] of Object.entries(words)) {
		const span = document.createElement("span");
		span.dataset.word = word;
		span.textContent = "word";
		const r = DOMRect.fromRect({ x: box.left, y: box.top, width: 40, height: 20 });
		span.getClientRects = () => [r] as unknown as DOMRectList;
		span.getBoundingClientRect = () => r;
		paragraph.appendChild(span);
	}
	root.appendChild(paragraph);
	document.body.appendChild(root);
	const nodes = {
		root: document.createElement("div"),
		band: document.createElement("div"),
		dimAbove: document.createElement("div"),
		dimBelow: document.createElement("div"),
	};
	return { root, nodes };
}

describe("ReadingRuler", () => {
	it("places the band and dimmers by transform over the word's line in the column", () => {
		const { root, nodes } = view({ 1: { left: 30, top: 100 } });
		const ruler = new ReadingRuler();
		ruler.attach(root, nodes);
		ruler.show(1);
		expect(nodes.root.dataset.visible).toBe("true");
		expect(nodes.band.style.transform).toBe("translate(20px, 95px)");
		expect(nodes.band.style.height).toBe("30px");
		expect(nodes.band.style.width).toBe("360px");
		expect(nodes.dimAbove.style.transform).toBe("translate(0px, -705px)");
		expect(nodes.dimBelow.style.transform).toBe("translate(0px, 125px)");
		expect(nodes.dimAbove.style.width).toBe("400px");
	});

	it("writes nothing for a word on the same line", () => {
		const { root, nodes } = view({ 1: { left: 30, top: 100 }, 2: { left: 90, top: 100 } });
		const ruler = new ReadingRuler();
		ruler.attach(root, nodes);
		ruler.show(1);
		const writes: string[] = [];
		new MutationObserver((records) => writes.push(...records.map((r) => r.type))).observe(
			nodes.band,
			{ attributes: true },
		);
		ruler.show(2);
		return Promise.resolve().then(() => expect(writes).toEqual([]));
	});

	it("hides while the page moves and comes back after", () => {
		const { root, nodes } = view({ 1: { left: 30, top: 100 } });
		const ruler = new ReadingRuler();
		ruler.attach(root, nodes);
		ruler.show(1);
		ruler.setMoving(true);
		expect(nodes.root.dataset.visible).toBe("false");
		ruler.setMoving(false);
		expect(nodes.root.dataset.visible).toBe("true");
	});

	it("hides when the word is not rendered", () => {
		const { root, nodes } = view({ 1: { left: 30, top: 100 } });
		const ruler = new ReadingRuler();
		ruler.attach(root, nodes);
		ruler.show(1);
		ruler.show(99);
		expect(nodes.root.dataset.visible).toBe("false");
	});
});

describe("wordElement", () => {
	function dom(html: string) {
		const root = document.createElement("div");
		root.innerHTML = html;
		return root;
	}

	it("finds a word's span", () => {
		const root = dom('<p><span data-word="5">a</span></p>');
		expect(wordElement(root, 5)?.dataset.word).toBe("5");
	});

	it("falls back to the heading a word belongs to", () => {
		const root = dom(
			'<h2 data-heading-word="10">Chapter One</h2><p><span data-word="12">a</span></p>',
		);
		expect(wordElement(root, 10)?.tagName).toBe("H2");
		expect(wordElement(root, 11)?.tagName).toBe("H2");
	});

	it("does not take a heading for a word past a rendered span after it", () => {
		const root = dom(
			'<h2 data-heading-word="10">Chapter One</h2><p><span data-word="12">a</span></p>',
		);
		expect(wordElement(root, 14)).toBeNull();
		expect(wordElement(root, 9)).toBeNull();
	});
});
