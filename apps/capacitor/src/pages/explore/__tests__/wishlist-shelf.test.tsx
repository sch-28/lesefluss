import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WishlistItem } from "../../../services/db/schema";
import { click, flush, type Rendered, render } from "../../../test/render";

const navigate = vi.hoisted(() => vi.fn());
const importFromCatalog = vi.hoisted(() => vi.fn());
const importMutate = vi.hoisted(() => vi.fn());
const state = vi.hoisted(() => ({
	items: undefined as WishlistItem[] | undefined,
	libraryIds: new Map<string, string>(),
	series: [] as { id: string; sourceUrl: string }[],
}));

vi.mock("../../../services/catalog/import", () => ({ importFromCatalog }));
vi.mock("../../../services/sync", () => ({ scheduleSyncPush: vi.fn() }));
vi.mock("../../../services/db/hooks", () => ({
	queryHooks: {
		useWishlist: () => ({ data: state.items }),
		useLibraryCatalogIds: () => ({ data: state.libraryIds }),
		useSeriesList: () => ({ data: state.series }),
		useImportSerialFromUrl: () => ({ mutateAsync: importMutate }),
	},
}));
vi.mock("../../../components/toast", () => ({
	toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("../../../components/app-shell/page-header", () => ({
	PageHeader: ({ title }: { title: string }) => <header>{title}</header>,
}));
vi.mock("@tanstack/react-router", () => ({ useRouter: () => ({ navigate }) }));

const { default: WishlistShelf } = await import("../wishlist-shelf");
const { default: ExploreWishlist } = await import("../wishlist-page");

const SERIES = "https://www.royalroad.com/fiction/21220/mother-of-learning";

const item = (over: Partial<WishlistItem>): WishlistItem => ({
	id: "w1",
	kind: "catalog",
	ref: "gutenberg:84",
	title: "Frankenstein",
	author: "Mary Shelley",
	coverUrl: null,
	deleted: false,
	createdAt: 1,
	updatedAt: 1,
	...over,
});

const BOOK = item({});
const SERIAL = item({
	id: "w2",
	kind: "serial",
	ref: SERIES,
	title: "Mother of Learning",
	author: "nobody103",
	coverUrl: "https://covers.test/mol.jpg",
});

const cards = (view: Rendered) => [
	...view.container.querySelectorAll("[data-testid='wishlist-card']"),
];

let view: Rendered | undefined;
beforeEach(() => {
	state.items = [SERIAL, BOOK];
	state.libraryIds = new Map();
	state.series = [];
	importFromCatalog.mockReturnValue(new Promise(() => undefined));
	importMutate.mockReturnValue(new Promise(() => undefined));
});
afterEach(() => {
	view?.unmount();
	view = undefined;
	vi.clearAllMocks();
});

describe("wishlist shelf", () => {
	it("stays off the landing while the wishlist is empty or loading", async () => {
		for (const items of [undefined, []]) {
			state.items = items;
			view = await render(<WishlistShelf />);
			expect(view.container.querySelector("[data-testid='wishlist-shelf']")).toBeNull();
			view.unmount();
		}
		view = undefined;
	});

	it("opens each title's detail page from its card", async () => {
		view = await render(<WishlistShelf />);
		expect(view.text()).toContain("Wishlist");
		await click(view.getButton(/Frankenstein/));
		expect(navigate).toHaveBeenCalledWith({
			to: "/tabs/explore/book/$catalogId",
			params: { catalogId: "gutenberg:84" },
		});
		await click(view.getButton(/^Mother of Learning/));
		expect(navigate).toHaveBeenCalledWith({
			to: "/tabs/explore/web-novel-preview",
			search: { url: SERIES },
		});
	});

	it("imports from the card through the existing imports", async () => {
		view = await render(<WishlistShelf />);
		await click(view.getButton("Add Frankenstein to library"));
		await flush();
		expect(importFromCatalog).toHaveBeenCalledWith("gutenberg:84", undefined);
		await click(view.getButton("Add Mother of Learning to library"));
		expect(importMutate).toHaveBeenCalledWith({ url: SERIES });
	});

	it("offers no import for a title already in the library", async () => {
		state.libraryIds = new Map([["gutenberg:84", "b1"]]);
		state.series = [
			{ id: "s1", sourceUrl: "https://royalroad.com/fiction/21220/mother-of-learning/" },
		];
		view = await render(<WishlistShelf />);
		expect(view.queryButton(/to library/)).toBeNull();
		expect(view.container.querySelectorAll("[data-testid='in-library-badge']")).toHaveLength(2);
	});

	it("goes to the full list from See all", async () => {
		view = await render(<WishlistShelf />);
		await click(view.getButton(/See all/));
		expect(navigate).toHaveBeenCalledWith({ to: "/tabs/explore/wishlist" });
	});

	it("shows at most twelve titles", async () => {
		state.items = Array.from({ length: 15 }, (_, i) =>
			item({ id: `w${i}`, ref: `gutenberg:${i}` }),
		);
		view = await render(<WishlistShelf />);
		expect(cards(view)).toHaveLength(12);
	});
});

describe("wishlist page", () => {
	it("lists every saved title", async () => {
		state.items = Array.from({ length: 15 }, (_, i) =>
			item({ id: `w${i}`, ref: `gutenberg:${i}` }),
		);
		view = await render(<ExploreWishlist />);
		expect(cards(view)).toHaveLength(15);
	});

	it("says how to fill an empty wishlist", async () => {
		state.items = [];
		view = await render(<ExploreWishlist />);
		expect(view.text()).toContain("Nothing on your wishlist yet");
	});
});
