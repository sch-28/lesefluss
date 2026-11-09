import { forwardRef, useImperativeHandle } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeBook } from "../../../test/book-fixture";
import { type Rendered, render } from "../../../test/render";
import { buildLibraryItems } from "../sort-filter";

const seen: { cache: unknown }[] = [];
const snapshot = { measured: "rows" };

vi.mock("virtua", () => ({
	Virtualizer: forwardRef<unknown, { cache?: unknown; children: React.ReactNode }>(
		function Virtualizer({ cache, children }, ref) {
			seen.push({ cache });
			useImperativeHandle(ref, () => ({ cache: snapshot, scrollToIndex: () => {} }));
			return <div>{children}</div>;
		},
	),
}));

const { default: VirtualBookGrid, clearSizeCaches } = await import("../virtual-book-grid");

const items = buildLibraryItems(
	Array.from({ length: 5 }, (_, i) => makeBook({ id: `b${i}`, title: `Book ${i}` })),
	[],
	new Map(),
	0,
);

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
	seen.length = 0;
	clearSizeCaches();
});

const grid = (viewMode: "grid" | "list", shown = items) => (
	<VirtualBookGrid
		items={shown}
		viewMode={viewMode}
		renderItem={(item) => <span>{item.kind}</span>}
	/>
);

describe("VirtualBookGrid row sizes across a trip to the reader", () => {
	it("hands the measured rows of the last visit back to virtua on return", async () => {
		view = await render(grid("list"));
		expect(seen[0]?.cache).toBeUndefined();
		view.unmount();
		view = await render(grid("list"));
		expect(seen.at(-1)?.cache).toBe(snapshot);
	});

	it("starts fresh when the layout or the library changed meanwhile", async () => {
		view = await render(grid("list"));
		view.unmount();
		view = await render(grid("grid"));
		expect(seen.at(-1)?.cache).toBeUndefined();
		view.unmount();
		view = await render(grid("grid", items.slice(1)));
		expect(seen.at(-1)?.cache).toBeUndefined();
	});
});
