import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { click, type Rendered, render } from "../../../test/render";
import type { LibraryViewMode } from "../header-controls";
import { ViewPanel, type ViewPanelProps, ViewSheet } from "../view-sheet";

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
	document.body.innerHTML = "";
});

function radio(name: string): HTMLButtonElement {
	const found = [...document.body.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find(
		(b) => b.textContent === name,
	);
	if (!found) throw new Error(`no ${name} radio`);
	return found;
}

function panelProps(
	viewMode: LibraryViewMode,
	overrides: Partial<ViewPanelProps> = {},
): ViewPanelProps {
	return {
		view: viewMode,
		onView: vi.fn(),
		canTable: true,
		cardFields: {
			settings: { grid: ["author"], list: ["words"] },
			onToggle: vi.fn(),
			renderPreview: (surface, fields) => <span>{`${surface}: ${fields.join(",")}`}</span>,
		},
		columns: { ids: ["title", "author"], onToggle: vi.fn(), onMove: vi.fn() },
		groupBy: "author",
		onGroupBy: vi.fn(),
		...overrides,
	};
}

describe("ViewPanel", () => {
	it("marks the current layout and grouping, and switches the layout", async () => {
		const onView = vi.fn();
		view = await render(<ViewPanel {...panelProps("grid", { onView })} />);
		expect(radio("Grid").getAttribute("aria-checked")).toBe("true");
		expect(radio("List").getAttribute("aria-checked")).toBe("false");
		expect(radio("Author").getAttribute("aria-checked")).toBe("true");
		await click(radio("List"));
		expect(onView).toHaveBeenCalledWith("list");
	});

	it("edits the card fields of the layout on screen, with its preview", async () => {
		view = await render(<ViewPanel {...panelProps("list")} />);
		expect(view.text()).toContain("Card fields");
		expect(view.text()).toContain("list: words");
	});

	it("shows the columns for the table, and no table where it does not fit", async () => {
		view = await render(<ViewPanel {...panelProps("table")} />);
		expect(view.text()).toContain("Columns");
		expect(view.text()).not.toContain("Card fields");
		view.unmount();
		view = await render(<ViewPanel {...panelProps("grid", { canTable: false })} />);
		expect(() => radio("Table")).toThrow();
	});

	it("sets group-by", async () => {
		const onGroupBy = vi.fn();
		view = await render(<ViewPanel {...panelProps("grid", { onGroupBy })} />);
		await click(radio("Series"));
		expect(onGroupBy).toHaveBeenCalledWith("series");
	});
});

describe("ViewSheet opened by G", () => {
	it("lands on the current grouping, moves with the arrows, and a pick closes it", async () => {
		const onGroupBy = vi.fn();
		const onOpenChange = vi.fn();
		view = await render(
			<ViewSheet
				{...panelProps("grid", { onGroupBy })}
				isDesktop
				open
				onOpenChange={onOpenChange}
				focusGroupBy
			/>,
		);
		const focused = document.activeElement as HTMLElement;
		expect(focused.textContent).toBe("Author");

		await act(async () =>
			focused.dispatchEvent(
				new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }),
			),
		);
		const next = document.activeElement as HTMLButtonElement;
		expect(next.textContent).toBe("Series");
		await act(async () => next.click());
		expect(onGroupBy).toHaveBeenCalledWith("series");
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("stays open on a pointer pick", async () => {
		const onOpenChange = vi.fn();
		view = await render(
			<ViewSheet
				{...panelProps("grid")}
				isDesktop
				open
				onOpenChange={onOpenChange}
				focusGroupBy={false}
			/>,
		);
		await click(radio("Tag"));
		expect(onOpenChange).not.toHaveBeenCalledWith(false);
	});

	function desktopSheet(open: boolean, focusGroupBy: boolean) {
		return (
			<ViewSheet
				{...panelProps("grid")}
				isDesktop
				open={open}
				onOpenChange={vi.fn()}
				focusGroupBy={focusGroupBy}
			/>
		);
	}

	it("does not hand focus to the View button on close, though the keyed flag clears with it", async () => {
		view = await render(desktopSheet(true, true));
		expect(document.activeElement?.textContent).toBe("Author");
		await view.rerender(desktopSheet(false, false));
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(document.activeElement).not.toBe(view.getButton("View"));
	});

	it("returns focus to the View button after a pointer open", async () => {
		view = await render(desktopSheet(true, false));
		await view.rerender(desktopSheet(false, false));
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(document.activeElement).toBe(view.getButton("View"));
	});

	it("names the trigger View", async () => {
		view = await render(
			<ViewSheet
				{...panelProps("list")}
				isDesktop={false}
				open={false}
				onOpenChange={vi.fn()}
				focusGroupBy={false}
			/>,
		);
		expect(view.getButton("View")).toBeTruthy();
	});
});
