import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../../test/render";
import { type ShelfViewTarget, useLibraryView } from "../use-library-view";

let latest: ReturnType<typeof useLibraryView>;
const Probe = ({ shelf }: { shelf: ShelfViewTarget | null }) => {
	latest = useLibraryView(shelf);
	return null;
};

let rendered: Rendered | undefined;
beforeEach(() => localStorage.clear());
afterEach(() => rendered?.unmount());

describe("useLibraryView", () => {
	it("a change on a shelf goes to the shelf, and All books keeps the device's layout", async () => {
		const save = vi.fn();
		const shelf: ShelfViewTarget = { id: "c1", view: null, save };
		rendered = await render(<Probe shelf={shelf} />);
		act(() => latest.setGroupBy("author"));
		act(() => latest.toggleColumn("words"));
		expect(latest.groupBy).toBe("author");
		expect(latest.columnIds).toContain("words");
		const saved = save.mock.calls.at(-1)?.[0] as string;
		expect(JSON.parse(saved)).toMatchObject({ groupBy: "author" });
		expect(JSON.parse(saved).columns).toContain("words");

		await rendered.rerender(<Probe shelf={null} />);
		expect(latest.groupBy).toBe("none");
		expect(latest.columnIds).not.toContain("words");

		await rendered.rerender(<Probe shelf={{ ...shelf, view: saved }} />);
		expect(latest.groupBy).toBe("author");
	});

	it("without a shelf, changes stay on this device", async () => {
		rendered = await render(<Probe shelf={null} />);
		act(() => latest.setGroupBy("status"));
		act(() => latest.moveColumn("rating", 1));
		expect(latest.groupBy).toBe("status");
		expect(latest.columnIds[1]).toBe("rating");
		expect(localStorage.getItem("lesefluss:library-group")).toBe("status");
	});

	it("keeps the second sort and its own direction", async () => {
		rendered = await render(<Probe shelf={null} />);
		act(() => latest.setSort({ sortBy: "author", thenBy: "title", thenReversed: true }));
		expect(latest.sort).toEqual({
			sortBy: "author",
			reversed: false,
			thenBy: "title",
			thenReversed: true,
		});
	});
});
