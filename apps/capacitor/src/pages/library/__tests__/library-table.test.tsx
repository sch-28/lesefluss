import type React from "react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeBook } from "../../../test/book-fixture";
import { flush, type Rendered, render } from "../../../test/render";
import { applyLibraryView, buildLibraryItems, type SortBy } from "../sort-filter";
import { type CellContext, columnsOf } from "../table-columns";

vi.mock("virtua", () => ({
	Virtualizer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const { default: LibraryTable } = await import("../library-table");

const books = [
	makeBook({ id: "a", title: "Alpha" }),
	makeBook({ id: "b", title: "Beta" }),
	makeBook({ id: "c", title: "Gamma" }),
	makeBook({ id: "d", title: "Delta" }),
];
const ctx: CellContext = {
	seriesMemberships: new Map(),
	collections: new Map(),
};

let rendered: Rendered;
afterEach(() => rendered.unmount());

async function mount(opts: { sortBy?: SortBy; reversed?: boolean; isSelecting?: boolean } = {}) {
	const { sortBy = "title", reversed = false, isSelecting = false } = opts;
	const items = applyLibraryView(buildLibraryItems(books, [], new Map()), {
		filter: {},
		sortBy,
		reversed,
	});
	const calls = {
		toggle: vi.fn(),
		selectRange: vi.fn(),
		open: vi.fn(),
		menu: vi.fn(),
		sort: vi.fn(),
	};
	rendered = await render(
		<LibraryTable
			items={items}
			columns={columnsOf(["title", "author", "words"])}
			ctx={ctx}
			sortBy={sortBy}
			reversed={reversed}
			onHeaderSort={calls.sort}
			selection={{
				isSelecting,
				isSelected: (id) => id === "b",
				toggle: calls.toggle,
				selectRange: calls.selectRange,
			}}
			onOpenBook={(book) => calls.open(book.id)}
			onOpenSeries={() => {}}
			onBookMenu={(book) => calls.menu(book.id)}
			onSeriesMenu={() => {}}
			draggable={false}
		/>,
	);
	await flush();
	return calls;
}

const row = (id: string) =>
	rendered.container.querySelector<HTMLElement>(`[data-book-id="${id}"]`) as HTMLElement;

function clickRow(id: string, init: MouseEventInit = {}) {
	act(() => {
		row(id).dispatchEvent(new MouseEvent("click", { bubbles: true, ...init }));
	});
}

describe("LibraryTable", () => {
	it("lists the rows in the view's order and marks the sorted header", async () => {
		await mount({ reversed: true });
		const ids = [...rendered.container.querySelectorAll<HTMLElement>("[data-book-id]")].map(
			(r) => r.dataset.bookId,
		);
		expect(ids).toEqual(["c", "d", "b", "a"]);
		expect(rendered.queryButton("Title, sorted descending")).not.toBeNull();
		expect(rendered.queryButton("Sort by Author")).not.toBeNull();
		expect(row("b").dataset.selected).toBe("true");
	});

	it("sorts by a header click", async () => {
		const calls = await mount();
		await act(async () => rendered.getButton("Sort by Words").click());
		expect(calls.sort).toHaveBeenCalledWith("words");
	});

	it("opens on a plain click, toggles on Ctrl or Cmd, selects a run on Shift", async () => {
		const calls = await mount();
		clickRow("a");
		expect(calls.open).toHaveBeenCalledWith("a");
		clickRow("c", { ctrlKey: true });
		clickRow("d", { metaKey: true });
		expect(calls.toggle.mock.calls).toEqual([["c"], ["d"]]);
		clickRow("d", { shiftKey: true });
		expect(calls.selectRange).toHaveBeenCalledWith("d");
		expect(calls.open).toHaveBeenCalledTimes(1);
	});

	it("toggles on a plain click while selecting, and opens the menu on right-click", async () => {
		const calls = await mount({ isSelecting: true });
		clickRow("a");
		expect(calls.toggle).toHaveBeenCalledWith("a");
		expect(calls.open).not.toHaveBeenCalled();
		act(() => {
			row("c").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
		});
		expect(calls.menu).toHaveBeenCalledWith("c");
	});
});
