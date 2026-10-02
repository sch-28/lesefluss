import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CatalogSearchResult } from "../../../services/catalog/client";
import { type Rendered, render } from "../../../test/render";

const { default: Hero } = await import("../hero");

const books: CatalogSearchResult[] = ["One", "Two", "Three"].map((title, i) => ({
	id: `gutenberg:${i}`,
	source: "gutenberg",
	title,
	author: null,
	language: "en",
	subjects: [],
	summary: `${title} summary`,
	coverUrl: null,
}));

function mockReducedMotion(reduce: boolean) {
	vi.stubGlobal(
		"matchMedia",
		vi.fn((query: string) => ({
			matches: query.includes("reduce") ? reduce : false,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
		})),
	);
}

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

const title = () => view?.container.querySelector("h2")?.textContent;

function swipe(el: Element, fromX: number, toX: number, dy = 0) {
	act(() => {
		el.dispatchEvent(
			Object.assign(new Event("touchstart", { bubbles: true }), {
				touches: [{ clientX: fromX, clientY: 300 }],
			}),
		);
		el.dispatchEvent(
			Object.assign(new Event("touchend", { bubbles: true }), {
				changedTouches: [{ clientX: toX, clientY: 300 + dy }],
			}),
		);
	});
}

describe("Hero", () => {
	it("auto-advances and shows a summary and a primary action", async () => {
		vi.useFakeTimers();
		mockReducedMotion(false);
		view = await render(<Hero books={books} onOpen={vi.fn()} intervalMs={1000} />);
		expect(title()).toBe("One");
		expect(view.text()).toContain("One summary");
		expect(view.queryButton("View book")).not.toBeNull();
		act(() => vi.advanceTimersByTime(1100));
		expect(title()).toBe("Two");
	});

	it("stays put when the reader prefers reduced motion", async () => {
		vi.useFakeTimers();
		mockReducedMotion(true);
		view = await render(<Hero books={books} onOpen={vi.fn()} intervalMs={1000} />);
		act(() => vi.advanceTimersByTime(5000));
		expect(title()).toBe("One");
	});

	it("swipes, and pauses auto-advance after a touch", async () => {
		vi.useFakeTimers();
		mockReducedMotion(false);
		view = await render(<Hero books={books} onOpen={vi.fn()} intervalMs={1000} />);
		const section = view.container.querySelector("section") as Element;
		swipe(section, 200, 100);
		expect(title()).toBe("Two");
		swipe(section, 100, 200);
		expect(title()).toBe("One");
		act(() => vi.advanceTimersByTime(3000));
		expect(title()).toBe("One");
	});

	it("ignores a mostly vertical drag, which is the page scrolling", async () => {
		mockReducedMotion(true);
		view = await render(<Hero books={books} onOpen={vi.fn()} />);
		swipe(view.container.querySelector("section") as Element, 200, 140, 120);
		expect(title()).toBe("One");
	});

	it("keeps its slide when the parent re-renders with a fresh array of the same books", async () => {
		mockReducedMotion(true);
		view = await render(<Hero books={books} onOpen={vi.fn()} />);
		swipe(view.container.querySelector("section") as Element, 200, 100);
		expect(title()).toBe("Two");
		await view.rerender(<Hero books={[...books]} onOpen={vi.fn()} />);
		expect(title()).toBe("Two");
		await view.rerender(<Hero books={books.slice(1)} onOpen={vi.fn()} />);
		expect(title()).toBe("Two");
	});

	it("gives each dot a 24px tap target", async () => {
		mockReducedMotion(true);
		view = await render(<Hero books={books} onOpen={vi.fn()} />);
		const dots = view.container.querySelectorAll('[role="tab"]');
		expect(dots).toHaveLength(3);
		for (const dot of dots) expect(dot.className).toContain("size-6");
	});
});
