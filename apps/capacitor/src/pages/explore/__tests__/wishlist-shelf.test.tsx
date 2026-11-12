import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WishlistItem } from "../../../services/db/schema";
import { expectListsHoldOnlyItems } from "../../../test/list-items";
import { click, flush, type Rendered, render } from "../../../test/render";

const navigate = vi.hoisted(() => vi.fn());
const importFromCatalog = vi.hoisted(() => vi.fn());
const importMutate = vi.hoisted(() => vi.fn());
const removeFromWishlist = vi.hoisted(() => vi.fn());
const scheduleSyncPush = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());
const addToWishlist = vi.hoisted(() => vi.fn());
const state = vi.hoisted(() => ({
	items: undefined as WishlistItem[] | undefined,
	libraryIds: new Map<string, string>(),
	series: [] as { id: string; sourceUrl: string }[],
}));

vi.mock("../../../services/catalog/import", () => ({ importFromCatalog }));
vi.mock("../../../services/sync", () => ({ scheduleSyncPush }));
vi.mock("../../../services/db/queries", () => ({ queries: { removeFromWishlist, addToWishlist } }));
const { wishlistHooks } = await vi.importActual<
	typeof import("../../../services/db/hooks/use-wishlist")
>("../../../services/db/hooks/use-wishlist");
vi.mock("../../../services/db/hooks", () => ({
	queryHooks: {
		useWishlist: () => ({ data: state.items }),
		useToggleWishlist: () => wishlistHooks.useToggleWishlist(),
		useLibraryCatalogIds: () => ({ data: state.libraryIds }),
		useSeriesList: () => ({ data: state.series }),
		useImportSerialFromUrl: () => ({ mutateAsync: importMutate }),
	},
}));
vi.mock("../../../components/toast", () => ({
	toast: { success: toastSuccess, error: toastError, info: vi.fn() },
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
	removeFromWishlist.mockResolvedValue(true);
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
		expectListsHoldOnlyItems(view.container);
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
		expect(
			view.getButton("Add Frankenstein to library").querySelector("svg")?.classList,
			"a library icon, not a bare plus",
		).toContain("lucide-library");
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

	it("removes a title from its card and pushes the removal", async () => {
		view = await render(<WishlistShelf />);
		await click(view.getButton("Remove Frankenstein from wishlist"));
		expect(removeFromWishlist).toHaveBeenCalledWith("catalog", "gutenberg:84");
		expect(scheduleSyncPush).toHaveBeenCalledTimes(1);
		expect(navigate).not.toHaveBeenCalled();
		await click(view.getButton("Remove Mother of Learning from wishlist"));
		expect(removeFromWishlist).toHaveBeenCalledWith("serial", SERIES);
	});

	it("offers Undo after a removal, which saves the title again once its card is gone", async () => {
		addToWishlist.mockResolvedValue(BOOK);
		view = await render(<WishlistShelf />);
		await click(view.getButton("Remove Frankenstein from wishlist"));
		await flush();
		expect(toastSuccess).toHaveBeenCalledWith(
			'Removed "Frankenstein" from your wishlist',
			expect.objectContaining({ action: expect.objectContaining({ label: "Undo" }) }),
		);
		view.unmount();
		view = undefined;
		const [, { action }] = toastSuccess.mock.calls[0] as [
			string,
			{ action: { onClick: () => void } },
		];
		action.onClick();
		await flush();
		expect(addToWishlist).toHaveBeenCalledWith(
			expect.objectContaining({ kind: "catalog", ref: "gutenberg:84", title: "Frankenstein" }),
		);
		expect(scheduleSyncPush).toHaveBeenCalledTimes(2);
	});

	it("still offers Remove on the card of a title already in the library", async () => {
		state.libraryIds = new Map([["gutenberg:84", "b1"]]);
		view = await render(<WishlistShelf />);
		await click(view.getButton("Remove Frankenstein from wishlist"));
		expect(removeFromWishlist).toHaveBeenCalledWith("catalog", "gutenberg:84");
	});

	it("says so when a card's Remove fails, and pushes nothing", async () => {
		removeFromWishlist.mockRejectedValue(new Error("db"));
		view = await render(<WishlistShelf />);
		await click(view.getButton("Remove Frankenstein from wishlist"));
		expect(toastError).toHaveBeenCalledWith("Couldn't update your wishlist");
		expect(scheduleSyncPush).not.toHaveBeenCalled();
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

	it("removes a title from its card on the full list", async () => {
		view = await render(<ExploreWishlist />);
		await click(view.getButton("Remove Mother of Learning from wishlist"));
		expect(removeFromWishlist).toHaveBeenCalledWith("serial", SERIES);
		expect(scheduleSyncPush).toHaveBeenCalledTimes(1);
	});

	it("says how to fill an empty wishlist", async () => {
		state.items = [];
		view = await render(<ExploreWishlist />);
		expect(view.text()).toContain("Nothing on your wishlist yet");
		expect(view.container.querySelector("svg")?.classList).toContain("lucide-heart");
		await click(view.getButton("Browse Explore"));
		expect(navigate).toHaveBeenCalledWith({ to: "/tabs/explore" });
	});
});
