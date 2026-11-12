import { afterEach, describe, expect, it, vi } from "vitest";
import { click, flush, type Rendered, render } from "../../../test/render";

const getGenres = vi.hoisted(() => vi.fn());
vi.mock("../../../services/catalog/client", () => ({ getGenres }));

const { default: BrowseRow } = await import("../browse-row");

function mockPointer(fine: boolean) {
	vi.stubGlobal(
		"matchMedia",
		vi.fn(() => ({ matches: fine, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
	);
}

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
	vi.unstubAllGlobals();
});

const renderRow = async () => {
	getGenres.mockResolvedValue({ genres: [{ id: "horror", label: "Horror", count: 3 }] });
	view = await render(<BrowseRow lang="en" onGenreTap={vi.fn()} onBrowseTags={vi.fn()} />);
	await flush();
	return view;
};

describe("BrowseRow", () => {
	it("gives a mouse the shelves' arrows, which page the genre row", async () => {
		mockPointer(true);
		const row = await renderRow();
		const nav = row.container.querySelector<HTMLElement>('nav[aria-label="Browse"]');
		if (!nav) throw new Error("no browse row");
		Object.defineProperty(nav, "clientWidth", { value: 500 });
		const scrollBy = vi.fn();
		nav.scrollBy = scrollBy;
		await click(row.getButton("Scroll genres right"));
		expect(scrollBy).toHaveBeenLastCalledWith(expect.objectContaining({ left: 400 }));
		await click(row.getButton("Scroll genres left"));
		expect(scrollBy).toHaveBeenLastCalledWith(expect.objectContaining({ left: -400 }));
	});

	it("leaves the arrows out on touch, where the row bleeds to the edges to swipe", async () => {
		mockPointer(false);
		const row = await renderRow();
		expect(row.queryButton("Scroll genres left")).toBeNull();
		expect(row.container.querySelector("nav")?.className).toContain("-mx-4");
		expect(row.text()).toContain("Horror");
	});
});
