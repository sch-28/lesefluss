import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BulkAction } from "../../../services/db/hooks/use-bulk-books";
import { makeBook } from "../../../test/book-fixture";
import { type Rendered, render } from "../../../test/render";
import { buildLibraryItems, type LibraryItem } from "../sort-filter";
import type { UseLibrarySelection } from "../use-library-selection";

const bulkRun = vi.fn(async (action: BulkAction) => ({
	kind: action.kind,
	succeeded: 1,
	failures: [],
}));

vi.mock("../../../services/db/hooks", () => ({
	queryHooks: {
		useBulkBookActions: () => ({
			run: bulkRun,
			isRunning: false,
			progress: { done: 0, total: 0, current: "" },
		}),
	},
}));
vi.mock("../../../components/toast", () => ({ toast: { success: () => {}, error: () => {} } }));

const { useLibrarySelection } = await import("../use-library-selection");

const a = makeBook({ id: "a", title: "A" });
const b = makeBook({ id: "b", title: "B" });
const c = makeBook({ id: "c", title: "C" });
const books = [a, b, c];
// The view shows c before a; b is filtered out.
const visible: LibraryItem[] = buildLibraryItems([c, a], [], new Map(), 0);

let selection: UseLibrarySelection;
function Harness() {
	selection = useLibrarySelection(books, visible);
	return null;
}

let view: Rendered | undefined;
beforeEach(async () => {
	bulkRun.mockClear();
	view = await render(<Harness />);
	await act(async () => {
		selection.toggle("a");
		selection.toggle("b");
		selection.toggle("c");
	});
});
afterEach(() => {
	view?.unmount();
	view = undefined;
});

describe("useLibrarySelection", () => {
	it("keeps the same books picked after an edit, for the next one", async () => {
		await act(() => selection.run({ kind: "rating", rating: 8 }));
		expect(bulkRun).toHaveBeenCalledTimes(1);
		expect(selection.isSelecting).toBe(true);
		expect(selection.picked.map((b) => b.id)).toEqual(["a", "b", "c"]);
	});

	it("ends the selection after a delete", async () => {
		await act(() => selection.run({ kind: "delete" }));
		expect(selection.isSelecting).toBe(false);
	});

	it("lists the picked books in the view's order, hidden ones last", () => {
		expect(selection.pickedInView.map((b) => b.id)).toEqual(["c", "a", "b"]);
	});
});
