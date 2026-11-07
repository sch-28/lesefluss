import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../../test/render";
import SortPopover from "../sort-popover";

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
	document.body.innerHTML = "";
});

function keydown(target: Element, key: string) {
	target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

function popover(open: boolean, focusGroupBy: boolean) {
	return (
		<SortPopover
			trigger={<button type="button">Sort</button>}
			sortBy="title"
			onSort={vi.fn()}
			reversed={false}
			onReversed={vi.fn()}
			thenBy="none"
			onThenBy={vi.fn()}
			groupBy="author"
			onGroupBy={vi.fn()}
			open={open}
			onOpenChange={vi.fn()}
			focusGroupBy={focusGroupBy}
		/>
	);
}

describe("SortPopover opened by G", () => {
	it("lands on the current grouping, moves with the arrows and picks with Enter", async () => {
		const onGroupBy = vi.fn();
		const onOpenChange = vi.fn();
		view = await render(
			<SortPopover
				trigger={<button type="button">Sort</button>}
				sortBy="title"
				onSort={vi.fn()}
				reversed={false}
				onReversed={vi.fn()}
				thenBy="none"
				onThenBy={vi.fn()}
				groupBy="author"
				onGroupBy={onGroupBy}
				open
				onOpenChange={onOpenChange}
				focusGroupBy
			/>,
		);
		const focused = document.activeElement as HTMLElement;
		expect(focused.textContent).toBe("Author");
		expect(focused.hasAttribute("data-selected")).toBe(true);

		await act(async () => keydown(focused, "ArrowDown"));
		const next = document.activeElement as HTMLButtonElement;
		expect(next.textContent).toBe("Series");

		// Enter on a focused button is the browser's own click.
		await act(async () => next.click());
		expect(onGroupBy).toHaveBeenCalledWith("series");
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("does not hand focus to the Sort button on close, though the keyed flag clears with it", async () => {
		view = await render(popover(true, true));
		expect(document.activeElement?.textContent).toBe("Author");
		await view.rerender(popover(false, false));
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(document.activeElement).not.toBe(view.getButton("Sort"));
	});

	it("returns focus to the Sort button after a pointer open", async () => {
		view = await render(popover(true, false));
		await view.rerender(popover(false, false));
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(document.activeElement).toBe(view.getButton("Sort"));
	});
});
