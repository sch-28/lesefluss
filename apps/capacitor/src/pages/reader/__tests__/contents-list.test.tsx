import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Chapter } from "../../../services/db/schema";
import { click, type Rendered, render } from "../../../test/render";
import ContentsList from "../contents-list";

const ROW_HEIGHT = 48;
const CHAPTER_COUNT = 30;
const SCROLLER_HEIGHT = 12 * ROW_HEIGHT;
// 6 rows on screen at the initial snap point.
const OBSCURED_HEIGHT = 6 * ROW_HEIGHT;

const chapters: Chapter[] = Array.from({ length: CHAPTER_COUNT }, (_, i) => ({
	title: `Chapter ${i + 1}`,
	startWord: i * 200,
}));

type LayoutProp = "offsetTop" | "offsetHeight" | "scrollHeight" | "clientHeight";

// happy-dom has no layout: rows get a fixed pitch by list position, and the
// scroller a fixed viewport over the full list.
const layout: Record<LayoutProp, (el: HTMLElement) => number> = {
	offsetTop: (el) =>
		el.tagName === "LI" && el.parentElement
			? [...el.parentElement.children].indexOf(el) * ROW_HEIGHT
			: 0,
	offsetHeight: (el) => (el.tagName === "LI" ? ROW_HEIGHT : 0),
	scrollHeight: (el) => (el.dataset.testid === "scroller" ? CHAPTER_COUNT * ROW_HEIGHT : 0),
	clientHeight: (el) => (el.dataset.testid === "scroller" ? SCROLLER_HEIGHT : 0),
};

function stubLayout() {
	const proto = HTMLElement.prototype;
	const originals = Object.keys(layout).map((prop) => {
		const original = Object.getOwnPropertyDescriptor(proto, prop);
		Object.defineProperty(proto, prop, {
			configurable: true,
			get(this: HTMLElement) {
				return layout[prop as LayoutProp](this);
			},
		});
		return [prop, original] as const;
	});
	return () => {
		for (const [prop, original] of originals) {
			if (original) Object.defineProperty(proto, prop, original);
			else delete (proto as unknown as Record<string, unknown>)[prop];
		}
	};
}

let view: Rendered | undefined;
let restoreLayout: () => void;

beforeEach(() => {
	restoreLayout = stubLayout();
});

afterEach(() => {
	view?.unmount();
	view = undefined;
	restoreLayout();
});

async function renderList(currentIndex: number, onNeedsFullHeight = vi.fn(), onJump = vi.fn()) {
	const ui = (index: number) => (
		<div data-testid="scroller">
			<ContentsList
				chapters={chapters}
				currentIndex={index}
				onJump={onJump}
				obscuredHeight={OBSCURED_HEIGHT}
				onNeedsFullHeight={onNeedsFullHeight}
			/>
		</div>
	);
	view = await render(ui(currentIndex));
	return { view, rerender: (index: number) => view?.rerender(ui(index)) };
}

const scrollTop = () =>
	view?.container.querySelector<HTMLElement>("[data-testid=scroller]")?.scrollTop;

describe("ContentsList", () => {
	it("marks the current chapter", async () => {
		const { view } = await renderList(12);
		const current = view.container.querySelectorAll("[aria-current]");
		expect(current).toHaveLength(1);
		expect(current[0].textContent).toBe("Chapter 13");
	});

	it("scrolls the current chapter near the top with one row of context", async () => {
		const onNeedsFullHeight = vi.fn();
		await renderList(12, onNeedsFullHeight);
		expect(scrollTop()).toBe(11 * ROW_HEIGHT);
		expect(onNeedsFullHeight).not.toHaveBeenCalled();
	});

	it("stays at the top for the first chapter", async () => {
		await renderList(0);
		expect(scrollTop()).toBe(0);
	});

	it("marks nothing and stays at the top before the first chapter", async () => {
		const onNeedsFullHeight = vi.fn();
		const { view } = await renderList(-1, onNeedsFullHeight);
		expect(view.container.querySelector("[aria-current]")).toBeNull();
		expect(scrollTop()).toBe(0);
		expect(onNeedsFullHeight).not.toHaveBeenCalled();
	});

	it("clamps at the end and asks for full height when the last chapter is current", async () => {
		const onNeedsFullHeight = vi.fn();
		await renderList(CHAPTER_COUNT - 1, onNeedsFullHeight);
		expect(scrollTop()).toBe(CHAPTER_COUNT * ROW_HEIGHT - SCROLLER_HEIGHT);
		expect(onNeedsFullHeight).toHaveBeenCalledOnce();
	});

	it("stays at half height while the clamped row is still on screen", async () => {
		const onNeedsFullHeight = vi.fn();
		// Clamped short of its target, but the row still sits 4th from the top.
		await renderList(CHAPTER_COUNT - 12 + 3, onNeedsFullHeight);
		expect(onNeedsFullHeight).not.toHaveBeenCalled();
	});

	it("does not re-scroll when the current chapter changes after opening", async () => {
		const { rerender } = await renderList(12);
		await rerender(20);
		expect(scrollTop()).toBe(11 * ROW_HEIGHT);
	});

	it("jumps to the tapped chapter's start word", async () => {
		const onJump = vi.fn();
		const { view } = await renderList(0, vi.fn(), onJump);
		await click(view.getButton("Chapter 5"));
		expect(onJump).toHaveBeenCalledWith(800);
	});
});
