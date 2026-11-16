import { afterEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../../test/render";
import { FOCUS_RING, useScrollToFocused } from "../virtual-book-grid";

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
	vi.restoreAllMocks();
});

const tokens = [null, ["a", "b"], ["c"]];

function Probe({ focusedKey }: { focusedKey: string | null }) {
	useScrollToFocused(tokens, focusedKey);
	return focusedKey ? <div data-focused className={FOCUS_RING} /> : null;
}

describe("useScrollToFocused", () => {
	it("scrolls the focused item itself into view, past the sticky headers", async () => {
		const scrollIntoView = vi.fn();
		Element.prototype.scrollIntoView = scrollIntoView;
		view = await render(<Probe focusedKey={null} />);
		await view.rerender(<Probe focusedKey="c" />);
		await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
		expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
		expect(FOCUS_RING).toMatch(/scroll-mt-/);
	});
});
