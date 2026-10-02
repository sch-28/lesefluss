import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flush, type Rendered, render } from "../../../test/render";

const getSimilarBooks = vi.hoisted(() => vi.fn());
const searchCatalog = vi.hoisted(() => vi.fn());
const useFeed = vi.hoisted(() => vi.fn());
const state = vi.hoisted(() => ({
	books: [] as unknown[],
	owned: new Map<string, string>(),
	isLoggedIn: false,
}));

vi.mock("../../../services/catalog/client", async (importActual) => ({
	...(await importActual<typeof import("../../../services/catalog/client")>()),
	getSimilarBooks,
	searchCatalog,
}));
vi.mock("../../../services/catalog/import", () => ({ importFromCatalog: vi.fn() }));
vi.mock("../../../services/db/hooks", () => ({
	queryHooks: {
		useBooks: () => ({ data: { books: state.books, covers: new Map() } }),
		useLibraryCatalogIds: () => ({ data: state.owned }),
		useStatsMeasuredSpeed: () => ({ data: { wpm: 300, sessionCount: 12 } }),
	},
}));
vi.mock("../../../services/social/feed", () => ({ useFeed }));
vi.mock("../../../contexts/sync-context", () => ({
	useSyncContext: () => ({ isLoggedIn: state.isLoggedIn }),
}));
vi.mock("../../../services/sync", () => ({ scheduleSyncPush: vi.fn() }));
vi.mock("../../../components/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@tanstack/react-router", () => ({ useRouter: () => ({ navigate: vi.fn() }) }));

const { default: PersonalShelves } = await import("../personal-shelves");

const result = (id: string, title: string) => ({
	id,
	source: "gutenberg",
	title,
	author: null,
	language: "en",
	subjects: [],
	summary: null,
	coverUrl: null,
});

let view: Rendered | undefined;
beforeEach(() => {
	state.books = [
		{
			id: "b1",
			title: "Frankenstein",
			author: "Mary Shelley",
			catalogId: "gutenberg:84",
			lastRead: 10,
		},
	];
	state.owned = new Map([["gutenberg:84", "b1"]]);
	state.isLoggedIn = false;
	getSimilarBooks.mockResolvedValue({
		results: [result("gutenberg:345", "Dracula"), result("gutenberg:84", "Frankenstein")],
	});
	searchCatalog.mockResolvedValue({
		results: [result("gutenberg:84", "Frankenstein"), result("gutenberg:18247", "The Last Man")],
	});
	useFeed.mockReturnValue({ data: undefined });
});
afterEach(() => {
	view?.unmount();
	view = undefined;
	vi.clearAllMocks();
});

const renderShelves = async () => {
	view = await render(<PersonalShelves onOpen={vi.fn()} onBrowse={vi.fn()} />);
	await flush();
	return view;
};

describe("PersonalShelves", () => {
	it("recommends from the reader's library, leaving out books they own", async () => {
		await renderShelves();
		expect(getSimilarBooks).toHaveBeenCalledWith("gutenberg:84", expect.anything());
		expect(view?.text()).toContain("Because you read Frankenstein");
		expect(view?.text()).toContain("Dracula");
		expect(view?.text()).toContain("More by authors you read");
		expect(view?.text()).toContain("The Last Man");
		expect(view?.container.querySelectorAll('[data-testid="catalog-card"]')).toHaveLength(2);
	});

	it("works without an account and never asks for the feed", async () => {
		await renderShelves();
		expect(useFeed).toHaveBeenCalledWith(false);
		expect(view?.text()).not.toContain("Friends are reading");
	});

	it("shows what friends are reading when signed in", async () => {
		state.isLoggedIn = true;
		useFeed.mockReturnValue({
			data: {
				pages: [
					{
						items: [
							{
								id: "e1",
								isOwn: false,
								book: { title: "Middlemarch", author: "George Eliot", catalogId: "gutenberg:145" },
							},
						],
						nextCursor: null,
					},
				],
			},
		});
		await renderShelves();
		expect(useFeed).toHaveBeenCalledWith(true);
		expect(view?.text()).toContain("Friends are reading");
		expect(view?.text()).toContain("Middlemarch");
	});

	it("shows nothing for an empty library and no friends", async () => {
		state.books = [];
		state.owned = new Map();
		await renderShelves();
		expect(view?.text()).toBe("");
		expect(getSimilarBooks).not.toHaveBeenCalled();
		expect(searchCatalog).not.toHaveBeenCalled();
	});
});
