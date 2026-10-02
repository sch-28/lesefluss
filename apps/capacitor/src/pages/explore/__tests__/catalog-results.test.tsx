import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogSearchResponse, CatalogSearchResult } from "../../../services/catalog/client";
import type { CatalogSearchFilters } from "../../../services/catalog/query-keys";
import { click, flush, type Rendered, render } from "../../../test/render";

const searchCatalog = vi.hoisted(() => vi.fn());

vi.mock("../../../services/catalog/client", async (importActual) => ({
	...(await importActual<typeof import("../../../services/catalog/client")>()),
	searchCatalog,
}));
vi.mock("../../../services/catalog/import", () => ({ importFromCatalog: vi.fn() }));
vi.mock("../../../services/db/hooks", () => ({
	queryHooks: {
		useStatsMeasuredSpeed: () => ({ data: { wpm: 300, sessionCount: 12 } }),
		useLibraryCatalogIds: () => ({ data: new Map() }),
	},
}));
vi.mock("../../../services/sync", () => ({ scheduleSyncPush: vi.fn() }));
vi.mock("../../../components/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@tanstack/react-router", () => ({ useRouter: () => ({ navigate: vi.fn() }) }));

const { default: CatalogResults } = await import("../catalog-results");

/** Captures the sentinel observer so a test can scroll it into view. */
const observers: { callback: IntersectionObserverCallback }[] = [];
class FakeIntersectionObserver {
	constructor(callback: IntersectionObserverCallback) {
		observers.push({ callback });
	}
	observe() {}
	disconnect() {}
}

async function scrollToSentinel() {
	const latest = observers[observers.length - 1];
	latest?.callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as never);
	await flush();
}

function book(i: number, over: Partial<CatalogSearchResult> = {}): CatalogSearchResult {
	return {
		id: `gutenberg:${i}`,
		source: "gutenberg",
		title: `Book ${i}`,
		author: `Author ${i}`,
		language: "de",
		subjects: ["Ghost stories", "England -- Fiction"],
		summary: null,
		coverUrl: null,
		hasEpub: true,
		...over,
	};
}

function page(n: number, total: number, size: number, over: Partial<CatalogSearchResponse> = {}) {
	const results = Array.from({ length: Math.min(size, total - (n - 1) * size) }, (_, i) =>
		book((n - 1) * size + i),
	);
	return {
		q: "",
		lang: "en",
		genre: null,
		sort: "popular",
		page: n,
		limit: size,
		total,
		results,
		...over,
	};
}

const FILTERS: CatalogSearchFilters = {
	q: "ghost",
	lang: "de",
	genre: "horror",
	tags: ["ghost-stories", "short-stories"],
	source: "standard_ebooks",
	sort: "title",
};

let view: Rendered | undefined;
beforeEach(() => {
	observers.length = 0;
	vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
});
afterEach(() => {
	view?.unmount();
	view = undefined;
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

const renderResults = (props: Partial<React.ComponentProps<typeof CatalogResults>> = {}) =>
	render(
		<CatalogResults
			filters={FILTERS}
			view="grid"
			onOpen={vi.fn()}
			onSearchSuggestion={vi.fn()}
			{...props}
		/>,
	);

describe("CatalogResults", () => {
	it("sends every filter together, asking for facets on the first page only", async () => {
		searchCatalog.mockImplementation(async ({ page: n }) => page(n, 4, 2));
		view = await renderResults();
		await flush();
		await scrollToSentinel();

		expect(searchCatalog.mock.calls[0]?.[0]).toMatchObject({
			q: "ghost",
			lang: "de",
			genre: "horror",
			tags: ["ghost-stories", "short-stories"],
			source: "standard_ebooks",
			sort: "title",
			page: 1,
			withTagFacets: true,
		});
		expect(searchCatalog.mock.calls[1]?.[0]).toMatchObject({ page: 2, withTagFacets: false });
	});

	it("loads the next page when the end of the list scrolls into view, then stops", async () => {
		searchCatalog.mockImplementation(async ({ page: n }) => page(n, 5, 2));
		view = await renderResults();
		await flush();
		expect(view.container.querySelectorAll('[data-testid="catalog-card"]')).toHaveLength(2);

		await scrollToSentinel();
		expect(view.container.querySelectorAll('[data-testid="catalog-card"]')).toHaveLength(4);
		await scrollToSentinel();
		expect(view.container.querySelectorAll('[data-testid="catalog-card"]')).toHaveLength(5);

		await scrollToSentinel();
		expect(searchCatalog).toHaveBeenCalledTimes(3);
		expect(view.queryButton(/Page/)).toBeNull();
	});

	it("shows a list with title, author, language and subjects", async () => {
		searchCatalog.mockResolvedValue(page(1, 1, 2));
		view = await renderResults({ view: "list" });
		await flush();
		const row = view.container.querySelector('[data-testid="catalog-list-item"]');
		expect(row?.textContent).toContain("Book 0");
		expect(row?.textContent).toContain("Author 0");
		expect(row?.textContent).toContain("German");
		expect(row?.textContent).toContain("Ghost stories");
		expect(view.container.querySelector('[data-testid="catalog-card"]')).toBeNull();
	});

	it("offers next steps when nothing matches", async () => {
		searchCatalog.mockResolvedValue(page(1, 0, 2, { suggestion: "Ghost Stories of an Antiquary" }));
		const onSearchSuggestion = vi.fn();
		const onClearFilters = vi.fn();
		const onSearchAllLanguages = vi.fn();
		view = await renderResults({ onSearchSuggestion, onClearFilters, onSearchAllLanguages });
		await flush();

		await click(view.getButton('Search for "Ghost Stories of an Antiquary"'));
		expect(onSearchSuggestion).toHaveBeenCalledWith("Ghost Stories of an Antiquary");
		await click(view.getButton("Clear filters"));
		expect(onClearFilters).toHaveBeenCalled();
		await click(view.getButton("Search all languages"));
		expect(onSearchAllLanguages).toHaveBeenCalled();
	});

	it("says the filters hide a new query and offers to search without them", async () => {
		searchCatalog.mockResolvedValue(page(1, 0, 2));
		const onClearFilters = vi.fn();
		view = await renderResults({ onClearFilters, hasQuery: true });
		await flush();
		expect(view.text()).toContain("No books match this search with the active filters.");
		expect(view.queryButton("Clear filters")).toBeNull();
		await click(view.getButton("Search without filters"));
		expect(onClearFilters).toHaveBeenCalled();
	});

	it("leaves out next steps that do not apply", async () => {
		searchCatalog.mockResolvedValue(page(1, 0, 2));
		view = await renderResults();
		await flush();
		expect(view.queryButton("Clear filters")).toBeNull();
		expect(view.queryButton("Search all languages")).toBeNull();
		expect(view.queryButton(/Search for/)).toBeNull();
	});
});
