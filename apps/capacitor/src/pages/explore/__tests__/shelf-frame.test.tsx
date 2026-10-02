import { afterEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../../test/render";

const { default: ShelfFrame } = await import("../shelf-frame");

function mockPointer(fine: boolean) {
	vi.stubGlobal(
		"matchMedia",
		vi.fn(() => ({ matches: fine, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
	);
}

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
	vi.unstubAllGlobals();
});

describe("ShelfFrame", () => {
	it("shows scroll arrows on pointer devices", async () => {
		mockPointer(true);
		view = await render(<ShelfFrame title="Most read">items</ShelfFrame>);
		expect(view.queryButton("Scroll Most read left")).not.toBeNull();
		expect(view.queryButton("Scroll Most read right")).not.toBeNull();
	});

	it("leaves them out on touch, where swiping scrolls", async () => {
		mockPointer(false);
		view = await render(<ShelfFrame title="Most read">items</ShelfFrame>);
		expect(view.queryButton("Scroll Most read left")).toBeNull();
	});
});
