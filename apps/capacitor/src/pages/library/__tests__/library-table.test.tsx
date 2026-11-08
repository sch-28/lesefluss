import { parseBookTags } from "@lesefluss/core";
import type React from "react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeBook } from "../../../test/book-fixture";
import { flush, type Rendered, render } from "../../../test/render";
import { applyLibraryView, buildLibraryItems, type SortState } from "../sort-filter";
import { type CellContext, type ColumnId, columnsOf } from "../table-columns";

vi.mock("virtua", () => ({
	Virtualizer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const { default: LibraryTable } = await import("../library-table");

const books = [
	makeBook({ id: "a", title: "Alpha", rating: 2 }),
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

async function mount(
	opts: { sort?: Partial<SortState>; isSelecting?: boolean; columns?: ColumnId[] } = {},
) {
	const { isSelecting = false, columns = ["title", "author", "words"] } = opts;
	const sort: SortState = {
		sortBy: "title",
		reversed: false,
		thenBy: null,
		thenReversed: false,
		...opts.sort,
	};
	const items = applyLibraryView(buildLibraryItems(books, [], new Map()), {
		filter: {},
		...sort,
	});
	const calls = {
		toggle: vi.fn(),
		selectRange: vi.fn(),
		open: vi.fn(),
		menu: vi.fn(),
		sort: vi.fn(),
		edit: vi.fn(),
		move: vi.fn(),
	};
	rendered = await render(
		<LibraryTable
			items={items}
			columns={columnsOf(columns)}
			ctx={ctx}
			sort={sort}
			onHeaderSort={calls.sort}
			onEditBook={(book, action) => calls.edit(book.id, action)}
			onMoveColumn={calls.move}
			libraryTags={["fantasy"]}
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
		await mount({ sort: { reversed: true } });
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
		expect(calls.sort).toHaveBeenCalledWith("words", false);
		act(() => {
			rendered
				.getButton("Sort by Author")
				.dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true }));
		});
		expect(calls.sort).toHaveBeenLastCalledWith("author", true);
	});

	it("shows both sorts' rank and direction", async () => {
		await mount({ sort: { thenBy: "author", thenReversed: true } });
		expect(rendered.queryButton("Title, sorted ascending, sort 1")).not.toBeNull();
		expect(rendered.queryButton("Author, sorted descending, sort 2")).not.toBeNull();
		expect(rendered.queryButton("Sort by Words")).not.toBeNull();
	});

	it("rates in place without opening the book, and Esc leaves the rating", async () => {
		const calls = await mount({ columns: ["title", "rating"] });
		await act(async () => rendered.getButton("Edit rating of Alpha").click());
		await act(async () => rendered.getButton("Rate 4 stars").click());
		expect(calls.edit).toHaveBeenCalledWith("a", { kind: "rating", rating: 8 });
		expect(calls.open).not.toHaveBeenCalled();
		expect(rendered.queryButton("Rate 4 stars")).toBeNull();

		await act(async () => rendered.getButton("Edit rating of Alpha").click());
		act(() => {
			document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		});
		expect(rendered.queryButton("Rate 4 stars")).toBeNull();
		expect(calls.edit).toHaveBeenCalledTimes(1);
	});

	it("picks a status in place", async () => {
		const calls = await mount({ columns: ["title", "status"] });
		await act(async () => rendered.getButton("Edit status of Beta").click());
		await flush();
		const finished = [...document.body.querySelectorAll("button")].find(
			(b) => b.textContent?.trim() === "Finished",
		);
		expect(finished).toBeDefined();
		await act(async () => finished?.click());
		expect(calls.edit).toHaveBeenCalledWith("b", { kind: "status", status: "finished" });
		expect(calls.open).not.toHaveBeenCalled();
	});

	it("adds and removes a tag in place, applied to the fresh book, and stays open", async () => {
		const calls = await mount({ columns: ["title", "tags"] });
		await act(async () => rendered.getButton("Edit tags of Alpha").click());
		await flush();
		const fantasy = () =>
			[...document.body.querySelectorAll("button")].find(
				(b) => b.textContent?.trim() === "fantasy",
			);
		await act(async () => fantasy()?.click());
		expect(fantasy()?.getAttribute("aria-pressed")).toBe("true");
		await act(async () => fantasy()?.click());
		expect(fantasy()?.getAttribute("aria-pressed")).toBe("false");

		const [[addId, add], [, remove]] = calls.edit.mock.calls;
		expect(addId).toBe("a");
		const added = add.patch({ tags: null });
		expect(added.kind === "write" && parseBookTags(added.tags)).toEqual(["fantasy"]);
		const removed = remove.patch({ tags: added.kind === "write" ? added.tags : null });
		expect(removed.kind === "write" && parseBookTags(removed.tags)).toEqual([]);
		expect(calls.open).not.toHaveBeenCalled();
	});

	it("selects the row on a Ctrl, Cmd or Shift click on an editable cell, without editing", async () => {
		const calls = await mount({ columns: ["title", "rating", "status", "tags"] });
		const modifiedClick = (label: string, init: MouseEventInit) =>
			act(() => {
				rendered
					.getButton(label)
					.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ...init }));
			});
		modifiedClick("Edit rating of Alpha", { ctrlKey: true });
		modifiedClick("Edit status of Gamma", { metaKey: true });
		modifiedClick("Edit tags of Delta", { shiftKey: true });
		await flush();
		expect(calls.toggle.mock.calls).toEqual([["a"], ["c"]]);
		expect(calls.selectRange).toHaveBeenCalledWith("d");
		expect(rendered.queryButton("Rate 4 stars")).toBeNull();
		const statusOption = [...document.body.querySelectorAll("button")].find(
			(b) => b.textContent?.trim() === "Finished",
		);
		expect(statusOption).toBeUndefined();
		expect(document.body.querySelector('[role="dialog"]')).toBeNull();
		expect(calls.edit).not.toHaveBeenCalled();
		expect(calls.open).not.toHaveBeenCalled();
	});

	it("does not edit cells while selecting", async () => {
		await mount({ columns: ["title", "rating"], isSelecting: true });
		expect(rendered.queryButton("Edit rating of Alpha")).toBeNull();
	});

	it("reorders by dragging a header, with a marker where it lands", async () => {
		const calls = await mount();
		const header = (id: string) =>
			rendered.container.querySelector(`[data-column="${id}"]`) as HTMLElement;
		const fire = (el: HTMLElement, type: string) =>
			act(() => {
				el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
			});
		expect(header("title").getAttribute("draggable")).toBe("false");
		fire(header("words"), "dragstart");
		fire(header("author"), "dragover");
		expect(rendered.container.querySelector('[data-testid="column-drop-marker"]')).not.toBeNull();
		fire(header("author"), "drop");
		expect(calls.move).toHaveBeenCalledWith("words", 1);
		expect(rendered.container.querySelector('[data-testid="column-drop-marker"]')).toBeNull();
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
