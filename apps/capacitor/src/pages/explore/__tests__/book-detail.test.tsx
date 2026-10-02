import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogBook, CatalogSearchResult } from "../../../services/catalog/client";
import { click, flush, type Rendered, render } from "../../../test/render";

const getCatalogBook = vi.hoisted(() => vi.fn());
const searchCatalog = vi.hoisted(() => vi.fn());
const getSimilarBooks = vi.hoisted(() => vi.fn());
const navigate = vi.hoisted(() => vi.fn());
const copyToClipboard = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());

vi.mock("../../../services/catalog/client", async (importActual) => ({
	...(await importActual<typeof import("../../../services/catalog/client")>()),
	getCatalogBook,
	searchCatalog,
	getSimilarBooks,
}));
vi.mock("../../../services/catalog/import", () => ({ importFromCatalog: vi.fn() }));
vi.mock("../../../services/db/queries", () => ({
	queries: { getBookByCatalogId: async () => null },
}));
vi.mock("../../../services/db/hooks", () => ({
	queryHooks: {
		useStatsMeasuredSpeed: () => ({ data: { wpm: 300, sessionCount: 12 } }),
		useLibraryCatalogIds: () => ({ data: new Map() }),
	},
}));
vi.mock("../../../services/sync", () => ({ scheduleSyncPush: vi.fn() }));
vi.mock("../../../services/deep-links/parse", () => ({
	claimedOrigin: () => "https://lesefluss.app",
}));
vi.mock("../../../utils/clipboard", () => ({ copyToClipboard }));
vi.mock("../../../components/toast", () => ({
	toast: { success: toastSuccess, error: vi.fn(), info: vi.fn() },
}));
vi.mock("../../../components/app-shell/page-header", () => ({
	PageHeader: ({ right }: { right?: React.ReactNode }) => <header>{right}</header>,
}));
vi.mock("@tanstack/react-router", () => ({ useRouter: () => ({ navigate }) }));

const { default: ExploreBookDetail } = await import("../book-detail");

const BOOK: CatalogBook = {
	id: "gutenberg:84",
	source: "gutenberg",
	title: "Frankenstein",
	author: "Mary Shelley",
	language: "en",
	subjects: [],
	summary: null,
	description: null,
	epubUrl: "https://x.test/84.epub",
	coverUrl: null,
	wordCount: 75_000,
};

const other = (id: string, title: string): CatalogSearchResult => ({
	id,
	source: "gutenberg",
	title,
	author: "Mary Shelley",
	language: "en",
	subjects: [],
	summary: null,
	coverUrl: null,
});

let view: Rendered | undefined;
beforeEach(() => {
	getCatalogBook.mockResolvedValue(BOOK);
	getSimilarBooks.mockResolvedValue({ results: [] });
	searchCatalog.mockResolvedValue({ results: [] });
});
afterEach(() => {
	view?.unmount();
	view = undefined;
	vi.clearAllMocks();
});

const renderDetail = async () => {
	view = await render(<ExploreBookDetail catalogId={encodeURIComponent(BOOK.id)} />);
	await flush();
	await flush();
	return view;
};

describe("catalog book detail", () => {
	it("shows pages and reading time at the reader's measured speed", async () => {
		await renderDetail();
		expect(view?.text()).toContain("300 pages · 4h 10m");
	});

	it("explains the length when tapped", async () => {
		await renderDetail();
		await click(view?.getButton(/300 pages/) as HTMLButtonElement);
		const explainer = document.querySelector("[data-testid='length-explainer']")?.textContent;
		expect(explainer).toContain("75,000 words");
		expect(explainer).toContain("250 words per page");
		expect(explainer).toContain("300 wpm, your average over 12 sessions");
		expect(explainer).not.toContain("approximate");
	});

	it("marks an estimated length and says so in the explainer", async () => {
		getCatalogBook.mockResolvedValue({ ...BOOK, wordCount: 78_000, wordCountEstimated: true });
		await renderDetail();
		const fact = view?.getButton(
			/^About 312 pages, 4 hours 20 minutes\. How is this worked out\?$/,
		);
		expect(fact?.textContent).toBe("~312 pages · 4h 20m");
		await click(fact as HTMLButtonElement);
		const explainer = document.querySelector("[data-testid='length-explainer']")?.textContent;
		expect(explainer).toContain("About 78,000 words");
		expect(explainer).toContain("exact once the book has been downloaded");
	});

	it("says the length is unknown only when there is no count or estimate", async () => {
		getCatalogBook.mockResolvedValue({ ...BOOK, wordCount: null });
		await renderDetail();
		expect(view?.text()).toContain("Length unknown");
		expect(view?.queryButton(/pages/)).toBeNull();
	});

	it("opens results for the author when the author is tapped", async () => {
		await renderDetail();
		await click(view?.getButton("Mary Shelley") as HTMLButtonElement);
		expect(navigate).toHaveBeenCalledWith({
			to: "/tabs/explore",
			search: { author: "Mary Shelley", lang: "all" },
		});
	});

	it("shows more by the author without the current book, and similar books", async () => {
		searchCatalog.mockResolvedValue({
			results: [
				other("gutenberg:84", "Frankenstein"),
				other("gutenberg:41445", "Frankenstein; Or, The Modern Prometheus"),
				other("gutenberg:18247", "The Last Man"),
				other("gutenberg:18248", "The Last Man; Volume 2"),
			],
		});
		getSimilarBooks.mockResolvedValue({ results: [other("gutenberg:345", "Dracula")] });
		await renderDetail();
		expect(searchCatalog).toHaveBeenCalledWith(expect.objectContaining({ author: "Mary Shelley" }));
		expect(view?.text()).toContain("More by Mary Shelley");
		expect(view?.text()).toContain("The Last Man");
		// Other editions of this book, and repeat editions of another, collapse away.
		expect(view?.text()).not.toContain("Modern Prometheus");
		expect(view?.text()).not.toContain("Volume 2");
		expect(view?.text()).toContain("Similar books");
		expect(view?.text()).toContain("Dracula");
		const shelfTitles = [...(view?.container.querySelectorAll("h2") ?? [])].map(
			(h) => h.textContent,
		);
		expect(shelfTitles.filter((t) => t?.includes("Frankenstein"))).toEqual([]);
	});

	it("hides both shelves when they would be empty", async () => {
		searchCatalog.mockResolvedValue({ results: [other("gutenberg:84", "Frankenstein")] });
		await renderDetail();
		expect(view?.text()).not.toContain("More by");
		expect(view?.text()).not.toContain("Similar books");
	});

	it("copies a link that opens this page on web", async () => {
		copyToClipboard.mockResolvedValue(true);
		await renderDetail();
		await click(view?.getButton("Share") as HTMLButtonElement);
		expect(copyToClipboard).toHaveBeenCalledWith(
			"https://lesefluss.app/app/tabs/explore/book/gutenberg%3A84",
		);
		expect(toastSuccess).toHaveBeenCalledWith("Link copied");
	});
});
