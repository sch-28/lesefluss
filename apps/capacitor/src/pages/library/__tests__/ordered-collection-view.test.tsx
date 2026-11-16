import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeBook } from "../../../test/book-fixture";
import { click, flush, type Rendered, render } from "../../../test/render";
import type { OrderedCardOptions } from "../ordered-collection-view";
import { buildLibraryItems, type LibraryItem } from "../sort-filter";

const reorder = vi.fn();
const remove = vi.fn();

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
// The shared grid virtualises; here it lays every item out, in the order it is given.
vi.mock("../virtual-book-grid", () => ({
	default: ({
		items,
		renderItem,
	}: {
		items: readonly LibraryItem[];
		renderItem: (item: LibraryItem) => React.ReactNode;
	}) => <div data-testid="library-items">{items.map((item) => renderItem(item))}</div>,
}));
vi.mock("../../../components/collections/collection-actions", () => ({
	CollectionActions: () => null,
}));
vi.mock("../../../components/action-sheet", () => ({
	ActionSheet: ({
		open,
		onOpenChange,
		items,
	}: {
		open: boolean;
		onOpenChange: (open: boolean) => void;
		items: { label: string; disabled?: boolean; onSelect: () => void }[];
	}) =>
		open ? (
			<div data-testid="sheet">
				{items.map((item) => (
					<button
						key={item.label}
						type="button"
						disabled={item.disabled}
						onClick={() => {
							onOpenChange(false);
							item.onSelect();
						}}
					>
						{item.label}
					</button>
				))}
			</div>
		) : null,
}));
const members = [
	{ bookId: "a", seriesIndex: 1, position: null },
	{ bookId: "b", seriesIndex: 2, position: null },
	{ bookId: "c", seriesIndex: 3, position: null },
].map((m) => ({ ...m, collectionId: "s", deleted: false, updatedAt: 0 }));

vi.mock("../../../services/db/hooks", () => ({
	queryHooks: {
		useCollectionMembers: () => ({ isSuccess: true, data: members }),
		useReorderCollection: () => ({ mutate: reorder }),
		useRemoveBooksFromCollection: () => ({ mutate: remove }),
		useStatsSpeedModel: () => ({ data: undefined }),
	},
}));

const { default: OrderedCollectionView } = await import("../ordered-collection-view");

const books = [
	makeBook({ id: "a", title: "Dune" }),
	makeBook({ id: "b", title: "Messiah" }),
	makeBook({ id: "c", title: "Children" }),
];
const items = buildLibraryItems(books, [], new Map(), Date.now());

/** Stands in for the library's card: what the view hands it is what the test reads. */
const renderCard = (item: LibraryItem, { seriesNumber, onMenu }: OrderedCardOptions) =>
	item.kind === "book" ? (
		<div data-testid="card" data-number={seriesNumber ?? ""}>
			<button type="button" draggable data-book-id={item.book.id}>
				{seriesNumber !== null && `#${seriesNumber} `}
				{item.book.title}
			</button>
			<button type="button" aria-label={`More for ${item.book.title}`} onClick={onMenu} />
		</div>
	) : null;
const series = {
	id: "s",
	name: "Dune",
	ordered: true,
	seriesKey: "dune",
	sortOrder: 1,
	bookCount: 3,
} as never;

let rendered: Rendered;

async function mount(canDrag = true) {
	rendered = await render(
		<OrderedCollectionView
			collection={series}
			items={items}
			viewMode="grid"
			renderCard={renderCard}
			onOpenBook={() => {}}
			onAddBooks={() => {}}
			canDrag={canDrag}
		/>,
	);
	await flush();
}

const rows = () => [...rendered.container.querySelectorAll<HTMLElement>("[data-ordered-book]")];
const order = () => rows().map((r) => r.dataset.orderedBook);

function drag(type: string, target: HTMLElement, clientX = 0) {
	const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX });
	Object.defineProperty(event, "dataTransfer", {
		value: { setData: () => {}, effectAllowed: "" },
	});
	act(() => {
		target.dispatchEvent(event);
	});
}

describe("OrderedCollectionView", () => {
	beforeEach(() => {
		reorder.mockClear();
		remove.mockClear();
	});
	afterEach(() => rendered.unmount());

	it("hands the shared grid its books in #N order, each card with its #N", async () => {
		await mount();
		expect(rendered.container.querySelector('[data-testid="library-items"]')).not.toBeNull();
		expect(order()).toEqual(["a", "b", "c"]);
		const cards = [...rendered.container.querySelectorAll<HTMLElement>('[data-testid="card"]')];
		expect(cards.map((c) => c.dataset.number)).toEqual(["1", "2", "3"]);
		expect(rows()[0]?.querySelector("button")?.textContent).toContain("#1 Dune");
		expect(rendered.container.querySelector("nav[aria-label=Breadcrumb]")).toBeNull();
		// The page header carries the name, back and actions.
		expect(rendered.container.querySelector("h2")).toBeNull();
		expect(rendered.queryButton("Back to Library")).toBeNull();
		expect(rendered.text()).toContain("3 books");
		expect(rendered.container.querySelector('[data-testid="ordered-next"]')?.textContent).toBe(
			"Start #1 · Dune",
		);
	});

	it("names the numbers a series lacks in its summary", async () => {
		const third = members[2] as (typeof members)[number];
		third.seriesIndex = 4;
		try {
			await mount();
			expect(
				rendered.container.querySelector('[data-testid="ordered-summary"]')?.textContent,
			).toContain("missing #3");
		} finally {
			third.seriesIndex = 3;
		}
	});

	it("keeps the next-book button full width on phone only, label-wide from the md breakpoint", async () => {
		await mount();
		const next = rendered.container.querySelector('[data-testid="ordered-next"]');
		expect(next?.classList.contains("w-full")).toBe(true);
		expect(next?.classList.contains("md:w-auto")).toBe(true);
	});

	it("drops a dragged row after another and writes 1..N for the rows that moved", async () => {
		await mount();
		const [first, , last] = rows();
		drag("dragstart", first);
		drag("dragover", last, 10);
		drag("drop", last, 10);
		expect(reorder).toHaveBeenCalledWith(
			{
				collectionId: "s",
				order: [
					{ bookId: "b", seriesIndex: 1, position: null },
					{ bookId: "c", seriesIndex: 2, position: null },
					{ bookId: "a", seriesIndex: 3, position: null },
				],
			},
			expect.anything(),
		);
		expect(order()).toEqual(["b", "c", "a"]);
	});

	it("drops nothing without a mouse drag", async () => {
		await mount(false);
		const [first, , last] = rows();
		drag("dragstart", first);
		drag("dragover", last, 10);
		drag("drop", last, 10);
		expect(reorder).not.toHaveBeenCalled();
		expect(order()).toEqual(["a", "b", "c"]);
	});

	it("moves a row up from its menu, and the first row cannot move up", async () => {
		await mount(false);
		await click(rendered.getButton("More for Children"));
		await click(rendered.getButton("Move up"));
		expect(reorder.mock.calls[0][0].order).toEqual([
			{ bookId: "c", seriesIndex: 2, position: null },
			{ bookId: "b", seriesIndex: 3, position: null },
		]);
		expect(order()).toEqual(["a", "c", "b"]);
		await click(rendered.getButton("More for Dune"));
		expect(rendered.getButton("Move up").disabled).toBe(true);
	});

	it("removes a book from the series from its menu", async () => {
		await mount();
		await click(rendered.getButton("More for Messiah"));
		await click(rendered.getButton("Remove from series"));
		expect(remove).toHaveBeenCalledWith({ collectionId: "s", bookIds: ["b"] });
	});
});
