import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeBook } from "../../../test/book-fixture";
import { click, flush, type Rendered, render } from "../../../test/render";

const reorder = vi.fn();
const remove = vi.fn();

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("../../../components/book-cover", () => ({ default: () => null }));
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
			collections={[series]}
			books={books}
			covers={new Map()}
			onOpenBook={() => {}}
			onAddBooks={() => {}}
			canDrag={canDrag}
		/>,
	);
	await flush();
}

const rows = () => [...rendered.container.querySelectorAll<HTMLElement>("[data-ordered-book]")];
const order = () => rows().map((r) => r.dataset.orderedBook);

function drag(type: string, target: HTMLElement, clientY = 0) {
	const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientY });
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

	it("lists the books in #N order, the number inline with the title, the name once", async () => {
		await mount();
		expect(order()).toEqual(["a", "b", "c"]);
		const numbers = [...rendered.container.querySelectorAll('[data-testid="ordered-number"]')];
		expect(numbers.map((n) => n.textContent?.trim())).toEqual(["#1", "#2", "#3"]);
		expect(numbers.every((n) => !/\bw-\d/.test(n.className))).toBe(true);
		expect(rows()[0]?.querySelector("button")?.textContent).toContain("#1 Dune");
		expect(rendered.container.querySelector("nav[aria-label=Breadcrumb]")).toBeNull();
		expect(rendered.container.querySelector("h2")?.textContent).toBe("Dune");
		expect(rendered.text()).toContain("3 books");
		expect(rendered.getButton("Back to Library")).toBeTruthy();
		expect(rendered.container.querySelector('[data-testid="ordered-next"]')?.textContent).toBe(
			"Start #1",
		);
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

	it("moves a row up from its menu, and the first row cannot move up", async () => {
		await mount(false);
		expect(rows()[0].getAttribute("draggable")).toBe("false");
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
