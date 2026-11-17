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

/** happy-dom lays nothing out: give every element a strip `scrollWidth` wide in a 500px box. */
function mockStripWidth(scrollWidth: number) {
	const proto = HTMLElement.prototype;
	const original = {
		scrollWidth: Object.getOwnPropertyDescriptor(proto, "scrollWidth"),
		clientWidth: Object.getOwnPropertyDescriptor(proto, "clientWidth"),
	};
	Object.defineProperty(proto, "scrollWidth", { configurable: true, get: () => scrollWidth });
	Object.defineProperty(proto, "clientWidth", { configurable: true, get: () => 500 });
	restoreWidth = () => {
		for (const [key, descriptor] of Object.entries(original)) {
			if (descriptor) Object.defineProperty(proto, key, descriptor);
			else Reflect.deleteProperty(proto, key);
		}
	};
}
let restoreWidth = () => {};

let view: Rendered | undefined;
afterEach(() => {
	localStorage.clear();
	view?.unmount();
	view = undefined;
	vi.unstubAllGlobals();
	restoreWidth();
	restoreWidth = () => {};
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
		mockStripWidth(1200);
		const row = await renderRow();
		const nav = row.container.querySelector<HTMLElement>('nav[aria-label="Browse"]');
		if (!nav) throw new Error("no browse row");
		nav.scrollLeft = 100;
		nav.dispatchEvent(new Event("scroll"));
		await flush();
		const scrollBy = vi.fn();
		nav.scrollBy = scrollBy;
		await click(row.getButton("Scroll genres right"));
		expect(scrollBy).toHaveBeenLastCalledWith(expect.objectContaining({ left: 400 }));
		await click(row.getButton("Scroll genres left"));
		expect(scrollBy).toHaveBeenLastCalledWith(expect.objectContaining({ left: -400 }));
	});

	it("puts both arrows together after the row, like a shelf's", async () => {
		mockPointer(true);
		mockStripWidth(1200);
		const row = await renderRow();
		const nav = row.container.querySelector('nav[aria-label="Browse"]');
		const arrows = nav?.nextElementSibling;
		expect(nav?.previousElementSibling).toBeNull();
		expect(arrows?.contains(row.getButton("Scroll genres left"))).toBe(true);
		expect(arrows?.contains(row.getButton("Scroll genres right"))).toBe(true);
	});

	it("leaves the arrows out for a mouse when every genre fits", async () => {
		mockPointer(true);
		mockStripWidth(500);
		const row = await renderRow();
		expect(row.queryButton("Scroll genres right")).toBeNull();
	});

	it("leaves the arrows out on touch, where the row bleeds to the edges to swipe", async () => {
		mockPointer(false);
		const row = await renderRow();
		expect(row.queryButton("Scroll genres left")).toBeNull();
		expect(row.container.querySelector("nav")?.className).toContain("-mx-4");
		expect(row.text()).toContain("Horror");
	});

	it("shows the genres last seen on this device at once, while the catalog is slow", async () => {
		mockPointer(false);
		getGenres.mockResolvedValue({
			lang: "en",
			genres: [{ id: "horror", label: "Horror", count: 3 }],
		});
		view = await render(<BrowseRow lang="en" onGenreTap={vi.fn()} onBrowseTags={vi.fn()} />);
		await flush();
		view.unmount();

		getGenres.mockReturnValue(new Promise(() => {}));
		view = await render(<BrowseRow lang="en" onGenreTap={vi.fn()} onBrowseTags={vi.fn()} />);
		expect(view.text()).toContain("Horror");
	});

	it("keeps the stored genres per language", async () => {
		mockPointer(false);
		getGenres.mockResolvedValue({
			lang: "en",
			genres: [{ id: "horror", label: "Horror", count: 3 }],
		});
		view = await render(<BrowseRow lang="en" onGenreTap={vi.fn()} onBrowseTags={vi.fn()} />);
		await flush();
		view.unmount();

		getGenres.mockReturnValue(new Promise(() => {}));
		view = await render(<BrowseRow lang="de" onGenreTap={vi.fn()} onBrowseTags={vi.fn()} />);
		expect(view.text()).not.toContain("Horror");
		expect(view.text()).toContain("Browse by tag");
	});
});
