import { seriesCollectionId } from "@lesefluss/core";
import { consumeBackPress } from "@lesefluss/ui/overlay-back";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CollectionWithCount } from "../../../services/db/queries/collections";
import type { Book } from "../../../services/db/schema";
import { click, type Rendered, render } from "../../../test/render";

const add = vi.fn();
const remove = vi.fn();
const createWithBooks = vi.fn();
const addNumbered = vi.fn();
let collections: Partial<CollectionWithCount>[] = [];
let memberships = new Map<string, string[]>();
let members: { bookId: string; seriesIndex: number | null }[] = [];

vi.mock("../../../services/db/hooks", () => ({
	queryHooks: {
		useCollections: () => ({ data: collections }),
		useCollectionMemberships: () => ({ data: memberships }),
		useCollectionMembers: (id: string | null) => ({
			data: id ? members : undefined,
			isPending: false,
		}),
		useAddBooksToCollection: () => ({ mutate: add }),
		useRemoveBooksFromCollection: () => ({ mutate: remove }),
		useCreateCollectionWithBooks: () => ({ mutate: createWithBooks }),
		useAddNumberedBooks: () => ({ mutate: addNumbered, isPending: false }),
	},
}));
vi.mock("../../toast", () => ({ toast: { success: () => {}, error: () => {} } }));
vi.mock(
	"@lesefluss/ui/drawer",
	async () => (await import("../../../test/overlay-mocks")).drawerModule,
);

const { CollectionPickerSheet, markOf } = await import("../collection-picker-sheet");

const book = (id: string, title = id) => ({ id, title }) as Book;
const collection = (over: Partial<CollectionWithCount>): Partial<CollectionWithCount> => ({
	ordered: false,
	seriesKey: null,
	bookCount: 0,
	...over,
});

const rows = () => [
	...document.querySelectorAll<HTMLElement>('[data-testid="collection-picker-row"]'),
];
const numberRows = () =>
	[...document.querySelectorAll('[data-testid="series-number-row"]')].map((r) =>
		[...r.children]
			.map((c) => (c instanceof HTMLInputElement ? `#${c.value}` : c.textContent))
			.join(" "),
	);

async function typeName(text: string) {
	const input = document.querySelector<HTMLInputElement>(
		'input[aria-label="New collection or series name"]',
	);
	if (!input) throw new Error("no name input");
	await act(async () => {
		Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, text);
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
}

let view: Rendered | undefined;
beforeEach(() => {
	for (const fn of [add, remove, createWithBooks, addNumbered]) fn.mockClear();
	collections = [];
	memberships = new Map();
	members = [];
});
afterEach(() => {
	view?.unmount();
	view = undefined;
});

describe("markOf", () => {
	it("tells all, some and none of the books apart", () => {
		const m = new Map([
			["a", ["c1"]],
			["b", ["c1", "c2"]],
		]);
		expect(markOf("c1", ["a", "b"], m)).toEqual({ mark: "all", count: 2 });
		expect(markOf("c2", ["a", "b"], m)).toEqual({ mark: "some", count: 1 });
		expect(markOf("c3", ["a", "b"], m)).toEqual({ mark: "none", count: 0 });
	});
});

describe("CollectionPickerSheet", () => {
	it("closes on the Android back press instead of navigating the page beneath", async () => {
		const onClose = vi.fn();
		view = await render(<CollectionPickerSheet books={[book("b1")]} open onClose={onClose} />);
		expect(consumeBackPress()).toBe(true);
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("leaves the back press to the router while closed", async () => {
		view = await render(<CollectionPickerSheet books={[]} open={false} onClose={vi.fn()} />);
		expect(consumeBackPress()).toBe(false);
	});

	it("adds the books to a plain collection at once", async () => {
		collections = [collection({ id: "c1", name: "Shelf" })];
		view = await render(
			<CollectionPickerSheet books={[book("a"), book("b")]} open onClose={vi.fn()} />,
		);
		await click(rows()[0] as HTMLElement);
		expect(add).toHaveBeenCalledWith({ collectionId: "c1", bookIds: ["a", "b"] });
		expect(document.querySelector('[data-testid="collection-remove-confirm"]')).toBeNull();
	});

	it("asks with the count before taking the books out of a plain collection they are all in", async () => {
		collections = [collection({ id: "c2", name: "Faves" })];
		memberships = new Map([
			["a", ["c2"]],
			["b", ["c2"]],
			["c", ["c2"]],
		]);
		view = await render(
			<CollectionPickerSheet books={[book("a"), book("b"), book("c")]} open onClose={vi.fn()} />,
		);
		await click(rows()[0] as HTMLElement);
		expect(remove).not.toHaveBeenCalled();
		expect(document.body.textContent).toContain("Remove from Faves?");
		expect(document.body.textContent).toContain("All 3 books leave Faves.");

		await click(view.getButton("Cancel"));
		expect(remove).not.toHaveBeenCalled();
		expect(rows()).toHaveLength(1);

		await click(rows()[0] as HTMLElement);
		await click(view.getButton("Remove 3 books"));
		expect(remove).toHaveBeenCalledWith({ collectionId: "c2", bookIds: ["a", "b", "c"] });
		expect(rows()).toHaveLength(1);
	});

	it("leaves the remove confirm on back, removing nothing", async () => {
		const onClose = vi.fn();
		collections = [collection({ id: "c2", name: "Faves" })];
		memberships = new Map([["a", ["c2"]]]);
		view = await render(
			<CollectionPickerSheet books={[book("a", "Emma")]} open onClose={onClose} />,
		);
		await click(rows()[0] as HTMLElement);
		expect(document.body.textContent).toContain('"Emma" leaves Faves.');
		await act(async () => {
			expect(consumeBackPress()).toBe(true);
		});
		expect(document.querySelector('[data-testid="collection-remove-confirm"]')).toBeNull();
		expect(remove).not.toHaveBeenCalled();
		expect(onClose).not.toHaveBeenCalled();
	});

	it("shows the #N each book gets in a series before Apply, after the highest number", async () => {
		collections = [
			collection({ id: "series-dune", name: "Dune", ordered: true, seriesKey: "dune" }),
		];
		members = [
			{ bookId: "x", seriesIndex: 1 },
			{ bookId: "y", seriesIndex: 3 },
		];
		view = await render(
			<CollectionPickerSheet
				books={[book("a", "Messiah"), book("b", "Children"), book("c", "Emperor")]}
				open
				onClose={vi.fn()}
			/>,
		);
		await click(rows()[0] as HTMLElement);
		expect(add).not.toHaveBeenCalled();
		expect(numberRows()).toEqual(["#4 Messiah", "#5 Children", "#6 Emperor"]);

		await click(view.getButton("Apply"));
		expect(addNumbered).toHaveBeenCalledTimes(1);
		expect(addNumbered.mock.calls[0]?.[0]).toEqual({
			target: { collectionId: "series-dune" },
			numbers: new Map([
				["a", 4],
				["b", 5],
				["c", 6],
			]),
		});
	});

	it("opens Set #N for a series every book is already in, to renumber, clear or remove them", async () => {
		collections = [
			collection({ id: "series-dune", name: "Dune", ordered: true, seriesKey: "dune" }),
		];
		memberships = new Map([
			["a", ["series-dune"]],
			["b", ["series-dune"]],
		]);
		members = [
			{ bookId: "a", seriesIndex: 2 },
			{ bookId: "b", seriesIndex: 5 },
		];
		view = await render(
			<CollectionPickerSheet books={[book("a"), book("b")]} open onClose={vi.fn()} />,
		);
		await click(rows()[0] as HTMLElement);
		expect(remove).not.toHaveBeenCalled();

		await click(view.getButton("Clear #N"));
		await click(view.getButton("Apply"));
		expect(addNumbered.mock.calls[0]?.[0]?.numbers).toEqual(
			new Map([
				["a", null],
				["b", null],
			]),
		);
		await click(view.getButton("Remove from Dune"));
		expect(remove).toHaveBeenCalledWith({ collectionId: "series-dune", bookIds: ["a", "b"] });
	});

	it("offers no Remove in Set #N when none of the books is in the series yet", async () => {
		collections = [
			collection({ id: "series-dune", name: "Dune", ordered: true, seriesKey: "dune" }),
		];
		view = await render(<CollectionPickerSheet books={[book("a")]} open onClose={vi.fn()} />);
		await click(rows()[0] as HTMLElement);
		expect(view.queryButton("Remove from Dune")).toBeNull();
	});

	it("leaves the Set #N step on back, without closing the sheet", async () => {
		const onClose = vi.fn();
		collections = [collection({ id: "o1", name: "Reading order", ordered: true })];
		view = await render(<CollectionPickerSheet books={[book("a")]} open onClose={onClose} />);
		await click(rows()[0] as HTMLElement);
		expect(document.querySelector('[data-testid="series-number-step"]')).not.toBeNull();

		await act(async () => {
			expect(consumeBackPress()).toBe(true);
		});
		expect(document.querySelector('[data-testid="series-number-step"]')).toBeNull();
		expect(onClose).not.toHaveBeenCalled();
	});

	it("starts a real series from the typed name, numbered from 1", async () => {
		view = await render(
			<CollectionPickerSheet books={[book("a", "One"), book("b", "Two")]} open onClose={vi.fn()} />,
		);
		await typeName("The Expanse");
		await click(view.getButton(/New series/));
		expect(numberRows()).toEqual(["#1 One", "#2 Two"]);

		await click(view.getButton("Apply"));
		expect(addNumbered.mock.calls[0]?.[0]).toEqual({
			target: { newSeries: "The Expanse" },
			numbers: new Map([
				["a", 1],
				["b", 2],
			]),
		});
	});

	it("puts a new series name that already exists into that series", async () => {
		const id = seriesCollectionId("the expanse");
		collections = [
			collection({ id, name: "The Expanse", ordered: true, seriesKey: "the expanse" }),
		];
		view = await render(<CollectionPickerSheet books={[book("a")]} open onClose={vi.fn()} />);
		await typeName("THE  Expanse!");
		await click(view.getButton(/New series/));
		await click(view.getButton("Apply"));
		expect(addNumbered.mock.calls[0]?.[0]?.target).toEqual({ collectionId: id });
	});

	it("creates a plain collection with the books", async () => {
		view = await render(<CollectionPickerSheet books={[book("a")]} open onClose={vi.fn()} />);
		await typeName("Beach reads");
		await click(view.getButton(/New collection/));
		expect(createWithBooks).toHaveBeenCalledWith({ name: "Beach reads", bookIds: ["a"] });
	});
});
