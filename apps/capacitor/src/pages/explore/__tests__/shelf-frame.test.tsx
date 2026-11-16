import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../../test/render";

const { default: ShelfFrame } = await import("../shelf-frame");

function mockPointer(fine: boolean) {
	vi.stubGlobal(
		"matchMedia",
		vi.fn(() => ({ matches: fine, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
	);
}

/** happy-dom lays nothing out: give every element a strip `scrollWidth` wide in a 500px box. */
function mockStripWidth(scrollWidth: number) {
	const proto = HTMLElement.prototype;
	const original = {
		scrollWidth: Object.getOwnPropertyDescriptor(proto, "scrollWidth"),
		clientWidth: Object.getOwnPropertyDescriptor(proto, "clientWidth"),
	};
	Object.defineProperty(proto, "scrollWidth", { configurable: true, get: () => scrollWidth });
	Object.defineProperty(proto, "clientWidth", { configurable: true, get: () => 500 });
	restoreWidth = () => {
		for (const [key, descriptor] of Object.entries(original)) {
			if (descriptor) Object.defineProperty(proto, key, descriptor);
			else Reflect.deleteProperty(proto, key);
		}
	};
}
let restoreWidth = () => {};

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
	vi.unstubAllGlobals();
	restoreWidth();
	restoreWidth = () => {};
});

describe("ShelfFrame", () => {
	it("shows scroll arrows on pointer devices while the strip overflows, the left one off at the start", async () => {
		mockPointer(true);
		mockStripWidth(1200);
		view = await render(<ShelfFrame title="Most read">items</ShelfFrame>);
		const left = view.getButton("Scroll Most read left") as HTMLButtonElement;
		const right = view.getButton("Scroll Most read right") as HTMLButtonElement;
		expect(left.disabled).toBe(true);
		expect(right.disabled).toBe(false);
	});

	it("turns the right arrow off once the strip is scrolled to its end", async () => {
		mockPointer(true);
		mockStripWidth(1200);
		view = await render(<ShelfFrame title="Most read">items</ShelfFrame>);
		const list = view.container.querySelector("ul") as HTMLElement;
		list.scrollLeft = 700;
		await act(async () => {
			list.dispatchEvent(new Event("scroll"));
		});
		expect((view.getButton("Scroll Most read left") as HTMLButtonElement).disabled).toBe(false);
		expect((view.getButton("Scroll Most read right") as HTMLButtonElement).disabled).toBe(true);
	});

	it("leaves the arrows out when every item fits", async () => {
		mockPointer(true);
		mockStripWidth(500);
		view = await render(<ShelfFrame title="Most read">items</ShelfFrame>);
		expect(view.queryButton("Scroll Most read left")).toBeNull();
	});

	it("bleeds the strip to the screen edges on a phone", async () => {
		mockPointer(false);
		view = await render(<ShelfFrame title="Most read">items</ShelfFrame>);
		expect(view.container.querySelector("ul")?.className).toContain("max-md:-mx-4");
	});

	it("leaves them out on touch, where swiping scrolls", async () => {
		mockPointer(false);
		view = await render(<ShelfFrame title="Most read">items</ShelfFrame>);
		expect(view.queryButton("Scroll Most read left")).toBeNull();
	});

	it("exposes the strip as a list named by the shelf title", async () => {
		mockPointer(false);
		view = await render(
			<ShelfFrame title="Most read">
				<li>One</li>
				<li>Two</li>
			</ShelfFrame>,
		);
		const list = view.container.querySelector("ul");
		const labelId = list?.getAttribute("aria-labelledby") ?? "";
		expect(document.getElementById(labelId)?.textContent).toBe("Most read");
		expect(list?.getAttribute("role")).toBe("list");
		expect(list?.querySelectorAll(":scope > li")).toHaveLength(2);
	});
});
