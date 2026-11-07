import type React from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../../test/render";
import { type ConditionTree, parseTree, treeToFilter } from "../condition-tree";
import { encodeFilterParam, FACETS, type FilterFields, facetValuesOf } from "../filter-model";
import type { ShelfEntry } from "../smart-shelves";

const navigate = vi.fn();
const update = vi.fn();
const create = vi.fn();
let isWide = false;

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));
vi.mock("../../../services/db/hooks", () => ({
	queryHooks: {
		useUpdateSmartShelf: () => ({ mutate: update, isPending: false }),
		useCreateSmartShelf: () => ({ mutate: create, isPending: false }),
	},
}));
vi.mock("../../../hooks/use-media-query", () => ({ useMediaQuery: () => isWide }));
vi.mock(
	"@lesefluss/ui/drawer",
	async () => (await import("../../../test/overlay-mocks")).drawerModule,
);
vi.mock("@lesefluss/ui/dialog", async () => {
	const { MockOverlay } = await import("../../../test/overlay-mocks");
	const Pass = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
	return {
		Dialog: (p: { open: boolean; onOpenChange: (open: boolean) => void }) => (
			<MockOverlay testId="dialog" {...p} />
		),
		DialogContent: Pass,
		DialogHeader: Pass,
		DialogTitle: Pass,
		DialogDescription: Pass,
	};
});

const book = (fields: Partial<FilterFields>) => ({
	facets: facetValuesOf(
		{
			title: "",
			status: "reading",
			tags: [],
			author: "",
			seriesId: null,
			collectionIds: [],
			wordCount: 50_000,
			rating: null,
			progress: 10,
			addedAt: 0,
			lastRead: null,
			...fields,
		},
		0,
	),
});
const items = [
	book({ status: "reading", tags: ["short"] }),
	book({ status: "reading", wordCount: 200_000 }),
	book({ status: "finished", tags: ["short"] }),
];
const options = Object.fromEntries(FACETS.map((f) => [f, []])) as unknown as Record<
	string,
	{ value: string; label: string; count: number }[]
>;
options.status = [
	{ value: "reading", label: "Reading", count: 2 },
	{ value: "finished", label: "Finished", count: 1 },
];
vi.mock("../use-smart-shelves", () => ({ useShelfLibrary: () => ({ items, options }) }));

const { ShelfConditionEditor } = await import("../shelf-condition-editor");

const nested: ConditionTree = {
	v: 1,
	root: {
		op: "and",
		items: [
			{ field: "status", op: "is", value: "reading" },
			{
				op: "or",
				items: [
					{ field: "tags", op: "is", value: "short" },
					{ field: "words", op: "gte", value: 100_000 },
				],
			},
		],
	},
};
const custom: ShelfEntry = {
	id: "s1",
	name: "Reading now",
	tree: nested,
	filter: null,
	pinned: true,
	isBuiltIn: false,
	view: null,
	sortOrder: 1,
};

let view: Rendered | undefined;
const onOpenChange = vi.fn();
beforeEach(() => {
	vi.clearAllMocks();
	isWide = false;
	vi.useFakeTimers();
});
afterEach(() => {
	view?.unmount();
	view = undefined;
	vi.useRealTimers();
});

const q = <T extends Element>(selector: string) => view?.container.querySelector(selector) as T;
const rows = () => [...(view?.container.querySelectorAll("[data-testid=condition-row]") ?? [])];
const press = (name: string | RegExp, nth = 0) => {
	const buttons = [...(view?.container.querySelectorAll("button") ?? [])].filter((b) => {
		const label = (b.getAttribute("aria-label") ?? b.textContent ?? "").trim();
		return typeof name === "string" ? label === name : name.test(label);
	});
	act(() => buttons[nth]?.click());
};
function setValue(el: HTMLInputElement | HTMLSelectElement, value: string) {
	const proto = el instanceof HTMLSelectElement ? HTMLSelectElement : HTMLInputElement;
	act(() => {
		Object.getOwnPropertyDescriptor(proto.prototype, "value")?.set?.call(el, value);
		el.dispatchEvent(
			new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }),
		);
	});
}
const settle = () => act(() => vi.advanceTimersByTime(150));
const count = () => q("[data-testid=shelf-live-count]")?.textContent;
const savedTree = (call: unknown[]) => parseTree((call[0] as { conditions: string }).conditions);

async function open(shelf: ShelfEntry | null, initialTree?: ConditionTree) {
	view = await render(
		<ShelfConditionEditor
			open
			onOpenChange={onOpenChange}
			shelf={shelf}
			initialTree={initialTree}
		/>,
	);
}

describe("ShelfConditionEditor", () => {
	it("opens a new shelf on one row and saves only once it is named and filled", async () => {
		await open(null);
		expect(rows()).toHaveLength(1);
		expect(rows()[0].hasAttribute("data-incomplete")).toBe(true);
		expect(view?.getButton("Save").disabled).toBe(true);

		setValue(q("input[placeholder='Shelf name']"), "Now");
		expect(view?.getButton("Save").disabled).toBe(true);
		setValue(q("select[aria-label='Status value']"), "reading");
		expect(view?.getButton("Save").disabled).toBe(false);

		press("Save");
		expect(create).toHaveBeenCalledTimes(1);
		const [input, { onSuccess }] = create.mock.calls[0];
		expect(input).toMatchObject({ name: "Now", pinned: true });
		const tree = savedTree(create.mock.calls[0]) as ConditionTree;
		expect(tree.root.items).toEqual([{ field: "status", op: "is", value: "reading" }]);
		act(() => onSuccess({ id: "new" }));
		expect(onOpenChange).toHaveBeenCalledWith(false);
		const filter = treeToFilter(tree);
		expect(navigate).toHaveBeenCalledWith({
			to: "/tabs/library",
			search: { shelf: "new", f: filter && encodeFilterParam(filter) },
		});
	});

	it("shows nested groups and counts matches live, a moment after an edit", async () => {
		await open(custom);
		settle();
		expect(view?.container.querySelectorAll("[data-testid=condition-group]")).toHaveLength(1);
		expect(count()).toBe("Show 2 books");

		// The nested group to all: short and long, no book.
		press("All", 1);
		expect(count()).toBe("Show 2 books");
		settle();
		expect(count()).toBe("Show 0 books");

		press("Any", 0);
		press("Any", 1);
		settle();
		expect(count()).toBe("Show 3 books");
	});

	it("adds, moves and removes rows and groups", async () => {
		await open(custom);
		const values = () =>
			rows().map((r) => (r.querySelector("select[aria-label=Field]") as HTMLSelectElement).value);
		expect(values()).toEqual(["status", "tags", "words"]);

		press("Condition options", 1);
		press("Move up");
		expect(values()).toEqual(["status", "tags", "words"]);
		expect(
			view?.container.querySelectorAll("[data-testid=condition-group] [data-testid=condition-row]"),
		).toHaveLength(1);

		press("Condition options", 0);
		press("Into group");
		expect(
			view?.container.querySelectorAll("[data-testid=condition-group] [data-testid=condition-row]"),
		).toHaveLength(2);

		press("Remove condition", 2);
		expect(values()).toEqual(["tags", "status"]);

		press("Group", 0);
		expect(view?.container.querySelectorAll("[data-testid=condition-group]")).toHaveLength(2);
		// The third level is the last: no Group button inside it.
		const inner = view?.container.querySelectorAll("[data-testid=condition-group]")[1];
		expect([...(inner?.querySelectorAll("button") ?? [])].map((b) => b.textContent)).not.toContain(
			"Group",
		);
		expect(view?.getButton("Save").disabled).toBe(true);
		press("Remove group", 1);
		expect(view?.getButton("Save").disabled).toBe(false);
	});

	it("blocks Save and outlines a nested group once its last row is gone", async () => {
		await open(custom);
		const group = () => q<HTMLElement>("[data-testid=condition-group]");
		expect(view?.getButton("Save").disabled).toBe(false);
		expect(group().dataset.incomplete).toBeUndefined();

		press("Remove condition", 2);
		press("Remove condition", 1);
		expect(group().querySelectorAll("[data-testid=condition-row]")).toHaveLength(0);
		expect(group().dataset.incomplete).toBe("true");
		expect(group().className).toContain("outline-dashed");
		expect(view?.getButton("Save").disabled).toBe(true);
		expect(view?.container.textContent).toContain("Add a condition to every group");

		press("Condition", 0);
		expect(group().querySelectorAll("[data-testid=condition-row]")).toHaveLength(1);
		expect(group().dataset.incomplete).toBeUndefined();
		expect(view?.container.textContent).not.toContain("Add a condition to every group");

		press("Remove group");
		expect(view?.getButton("Save").disabled).toBe(false);
	});

	it("saves an edited shelf in place, and Cancel writes nothing", async () => {
		await open(custom);
		setValue(q("input[placeholder='Shelf name']"), "Reading, short");
		press("Cancel");
		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(update).not.toHaveBeenCalled();

		press("Save");
		expect(update).toHaveBeenCalledTimes(1);
		expect(update.mock.calls[0][0]).toMatchObject({ id: "s1", name: "Reading, short" });
		expect(savedTree(update.mock.calls[0])).toEqual(nested);
		expect(create).not.toHaveBeenCalled();
	});

	it("saves with Ctrl+Enter in the desktop dialog, never while a row is empty", async () => {
		isWide = true;
		await open(custom);
		expect(q("[data-testid=dialog]")).not.toBeNull();
		expect(count()).toBe("2 books match · live");
		const name = q<HTMLInputElement>("input[placeholder='Shelf name']");
		const ctrlEnter = () =>
			act(() => {
				name.dispatchEvent(
					new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true }),
				);
			});

		press("Condition", 0);
		ctrlEnter();
		expect(update).not.toHaveBeenCalled();
		press("Remove condition", 3);
		ctrlEnter();
		expect(update).toHaveBeenCalledTimes(1);
	});

	it("starts from the given tree over the shelf's own", async () => {
		await open(
			{ ...custom, filter: { status: { in: ["reading"], out: [] } } },
			{
				v: 1,
				root: { op: "and", items: [{ field: "status", op: "is", value: "finished" }] },
			},
		);
		expect(rows()).toHaveLength(1);
		expect(q<HTMLSelectElement>("select[aria-label='Status value']").value).toBe("finished");
	});
});
