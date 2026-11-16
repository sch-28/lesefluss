import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Book } from "../../../services/db/schema";
import { makeBook } from "../../../test/book-fixture";
import { type Rendered, render } from "../../../test/render";
import { buildLibraryItems } from "../sort-filter";
import type { UseLibrarySelection } from "../use-library-selection";

vi.mock("../../../services/db/hooks", () => ({
	queryHooks: {
		useBulkBookActions: () => ({
			run: vi.fn(),
			isRunning: false,
			progress: { done: 0, total: 0, current: "" },
		}),
	},
}));
vi.mock("../../../components/toast", () => ({ toast: { success: () => {}, error: () => {} } }));

const { useLibrarySelection } = await import("../use-library-selection");

const books = Array.from({ length: 200 }, (_, i) => makeBook({ id: `b${i}`, title: `Book ${i}` }));
const byId = new Map(books.map((book) => [book.id, book]));
const view = (...ids: string[]) =>
	buildLibraryItems(
		ids.map((id) => byId.get(id) as Book),
		[],
		new Map(),
		0,
	);

let selection: UseLibrarySelection;
function Harness({ visibleIds }: { visibleIds: string[] }) {
	selection = useLibrarySelection(books, view(...visibleIds));
	return null;
}

let rendered: Rendered | undefined;
async function mount(visibleIds: string[]) {
	rendered = await render(<Harness visibleIds={visibleIds} />);
}
async function filterTo(visibleIds: string[]) {
	await rendered?.rerender(<Harness visibleIds={visibleIds} />);
}
const pickedIds = () => selection.picked.map((book) => book.id);

afterEach(() => {
	rendered?.unmount();
	rendered = undefined;
});

describe("useLibrarySelection across the view", () => {
	it("keeps the picked books when the filter changes, hidden ones included", async () => {
		await mount(["b0", "b1", "b2"]);
		await act(async () => {
			selection.toggle("b0");
			selection.toggle("b2");
		});
		await filterTo(["b1"]);
		expect(selection.isSelecting).toBe(true);
		expect(pickedIds()).toEqual(["b0", "b2"]);
		await filterTo(["b0", "b1", "b2"]);
		expect(selection.isSelected("b2")).toBe(true);
	});

	it("selects every book of the filtered view with Select all, not just the rendered ones", async () => {
		const filtered = books.filter((_, i) => i % 2 === 0).map((book) => book.id);
		await mount(filtered);
		await act(async () => selection.begin("b0"));
		await act(async () => selection.toggleAllVisible());
		expect(selection.visibleCount).toBe(100);
		expect(pickedIds()).toEqual(filtered);
		expect(selection.allVisibleSelected).toBe(true);
		expect(selection.isSelected("b1")).toBe(false);
	});

	it("adds Select all to what an earlier filter picked", async () => {
		await mount(["b0", "b1"]);
		await act(async () => selection.toggle("b0"));
		await filterTo(["b5", "b6"]);
		await act(async () => selection.toggleAllVisible());
		expect(pickedIds()).toEqual(["b0", "b5", "b6"]);
		await act(async () => selection.toggleAllVisible());
		expect(pickedIds()).toEqual(["b0"]);
	});

	it("runs a Shift range in the visible order, not the library order", async () => {
		await mount(["b9", "b3", "b7", "b1"]);
		await act(async () => selection.toggle("b3"));
		await act(async () => selection.selectRange("b1"));
		expect(new Set(pickedIds())).toEqual(new Set(["b3", "b7", "b1"]));
		expect(selection.isSelected("b9")).toBe(false);
	});

	it("toggles one book when the range anchor is filtered out", async () => {
		await mount(["b0", "b1", "b2", "b3"]);
		await act(async () => selection.toggle("b0"));
		await filterTo(["b1", "b2", "b3"]);
		await act(async () => selection.selectRange("b3"));
		expect(pickedIds()).toEqual(["b0", "b3"]);
		await act(async () => selection.selectRange("b1"));
		expect(pickedIds()).toEqual(["b0", "b1", "b2", "b3"]);
	});

	it("clears everything on exit", async () => {
		await mount(["b0", "b1"]);
		await act(async () => {
			selection.toggle("b0");
			selection.toggle("b1");
		});
		await act(async () => selection.exit());
		expect(selection.isSelecting).toBe(false);
		expect(pickedIds()).toEqual([]);
		await act(async () => selection.begin("b1"));
		expect(pickedIds()).toEqual(["b1"]);
	});
});
