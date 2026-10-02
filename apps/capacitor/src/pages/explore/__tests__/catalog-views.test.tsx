import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogSearchResponse, CatalogSearchResult } from "../../../services/catalog/client";
import { click, flush, type Rendered, render, setOnline } from "../../../test/render";

const searchCatalog = vi.hoisted(() => vi.fn());
const getLanding = vi.hoisted(() => vi.fn());
const getRandomShelf = vi.hoisted(() => vi.fn());
const getLibraryCatalogIds = vi.hoisted(() => vi.fn());
const importFromCatalog = vi.hoisted(() => vi.fn());
const navigate = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());

vi.mock("../../../services/catalog/client", async (importActual) => ({
	...(await importActual<typeof import("../../../services/catalog/client")>()),
	searchCatalog,
	getLanding,
	getRandomShelf,
}));
vi.mock("../../../services/catalog/import", () => ({ importFromCatalog }));
vi.mock("../../../services/db/hooks", async () => {
	const { useQuery } = await import("@tanstack/react-query");
	const { bookKeys } = await import("../../../services/db/hooks/query-keys");
	return {
		queryHooks: {
			useSettings: () => ({ data: { wpm: 300 } }),
			useSeriesList: () => ({ data: [] }),
			useLibraryCatalogIds: () =>
				useQuery({ queryKey: bookKeys.catalogIds, queryFn: getLibraryCatalogIds }),
		},
	};
});
vi.mock("../../../services/sync", () => ({ scheduleSyncPush: vi.fn() }));
vi.mock("../../../services/serial-scrapers", () => ({ providerLabel: (id: string) => id }));
vi.mock("../../../components/toast", () => ({
	toast: { success: toastSuccess, error: toastError, info: vi.fn() },
}));
vi.mock("@tanstack/react-router", () => ({ useRouter: () => ({ navigate }) }));

const { default: CatalogResults } = await import("../catalog-results");
const { default: CatalogResultCard } = await import("../catalog-result-card");

function book(over: Partial<CatalogSearchResult> = {}): CatalogSearchResult {
	return {
		id: "gutenberg:84",
		source: "gutenberg",
		title: "Frankenstein",
		author: "Mary Shelley",
		language: "en",
		subjects: [],
		summary: null,
		coverUrl: null,
		hasEpub: true,
		...over,
	};
}

function searchResponse(results: CatalogSearchResult[]): CatalogSearchResponse {
	return {
		q: "x",
		lang: "en",
		genre: null,
		sort: "relevance",
		page: 1,
		limit: 20,
		total: results.length,
		results,
	};
}

const never = () => new Promise<never>(() => undefined);

let view: Rendered | undefined;
beforeEach(() => {
	getLibraryCatalogIds.mockResolvedValue(new Map());
	getRandomShelf.mockResolvedValue({ results: [] });
});
afterEach(() => {
	view?.unmount();
	view = undefined;
	setOnline(true);
	vi.clearAllMocks();
});

const renderResults = () =>
	render(
		<CatalogResults
			filters={{ q: "frank", lang: "en", tags: [], sort: "relevance" }}
			view="grid"
			onOpen={vi.fn()}
			onSearchSuggestion={vi.fn()}
		/>,
	);

describe("search results states", () => {
	it("shows skeleton cards in the grid while loading", async () => {
		searchCatalog.mockImplementation(never);
		view = await renderResults();
		expect(view.container.querySelectorAll('[data-testid="card-skeleton"]').length).toBe(12);
	});

	it("shows an error with Retry that refetches", async () => {
		searchCatalog.mockRejectedValueOnce(new Error("Search failed (500)"));
		view = await renderResults();
		await flush();
		expect(view.text()).toContain("Something went wrong");

		searchCatalog.mockResolvedValueOnce(searchResponse([book()]));
		await click(view.getButton("Retry"));
		expect(searchCatalog).toHaveBeenCalledTimes(2);
		expect(view.text()).toContain("Frankenstein");
	});

	it("shows an offline message when the device is offline", async () => {
		setOnline(false);
		searchCatalog.mockRejectedValueOnce(new TypeError("Failed to fetch"));
		view = await renderResults();
		await flush();
		expect(view.text()).toContain("You're offline");
		expect(view.text()).not.toContain("Failed to fetch");
	});
});

describe("catalog card membership and quick add", () => {
	const renderCard = (over: Partial<CatalogSearchResult> = {}) =>
		render(<CatalogResultCard result={book(over)} onOpen={vi.fn()} />);
	const card = () => view?.container.querySelector('[data-testid="catalog-card"]');
	const addButton = () => view?.queryButton("Add Frankenstein to library") ?? null;

	it("marks a book that is already in the library and offers no quick add", async () => {
		getLibraryCatalogIds.mockResolvedValue(new Map([["gutenberg:84", "local1"]]));
		view = await renderCard();
		await flush();
		expect(card()?.getAttribute("data-in-library")).toBe("true");
		expect(view.text()).toContain("In library");
		expect(addButton()).toBeNull();
	});

	it("offers quick add for a book not in the library", async () => {
		view = await renderCard();
		await flush();
		expect(card()?.getAttribute("data-in-library")).toBe("false");
		expect(view.text()).not.toContain("In library");
		expect(addButton()).not.toBeNull();
	});

	it("offers no quick add when there is no EPUB", async () => {
		view = await renderCard({ hasEpub: false });
		await flush();
		expect(addButton()).toBeNull();
	});

	it("imports without opening the book and confirms with an Open action", async () => {
		const onOpen = vi.fn();
		importFromCatalog.mockResolvedValue({ book: { id: "local1" }, existed: false });
		view = await render(<CatalogResultCard result={book()} onOpen={onOpen} />);
		await flush();

		getLibraryCatalogIds.mockResolvedValue(new Map([["gutenberg:84", "local1"]]));
		await click(addButton() as HTMLButtonElement);
		await flush();

		expect(importFromCatalog).toHaveBeenCalledWith("gutenberg:84", undefined);
		expect(onOpen).not.toHaveBeenCalled();
		expect(toastSuccess).toHaveBeenCalledWith(
			expect.stringContaining("Frankenstein"),
			expect.objectContaining({ action: expect.objectContaining({ label: "Open" }) }),
		);
		// The import invalidated the membership query, so the marker flips in place.
		expect(card()?.getAttribute("data-in-library")).toBe("true");

		const { action } = toastSuccess.mock.calls[0]?.[1] as { action: { onClick: () => void } };
		action.onClick();
		expect(navigate).toHaveBeenCalledWith({ to: "/tabs/reader/$id", params: { id: "local1" } });
	});

	it("still confirms when the card unmounts mid-import", async () => {
		let finish: (v: unknown) => void = () => undefined;
		importFromCatalog.mockImplementation(() => new Promise((r) => (finish = r)));
		view = await renderCard();
		await flush();
		await click(addButton() as HTMLButtonElement);

		view.unmount();
		view = undefined;
		finish({ book: { id: "local1" }, existed: false });
		await flush();
		expect(toastSuccess).toHaveBeenCalledWith(
			expect.stringContaining("Frankenstein"),
			expect.objectContaining({ action: expect.objectContaining({ label: "Open" }) }),
		);
	});

	it("disables every card for a book while one of them imports it", async () => {
		importFromCatalog.mockImplementation(() => new Promise(() => undefined));
		view = await render(
			<>
				<CatalogResultCard result={book()} onOpen={vi.fn()} />
				<CatalogResultCard result={book()} onOpen={vi.fn()} />
			</>,
		);
		await flush();
		const [first, second] = view.container.querySelectorAll<HTMLButtonElement>(
			'button[aria-label="Add Frankenstein to library"]',
		);
		await click(first as HTMLButtonElement);
		expect(first?.disabled).toBe(true);
		expect(second?.disabled).toBe(true);
		expect(importFromCatalog).toHaveBeenCalledTimes(1);
	});

	it("reports a failed quick add with a Retry action", async () => {
		importFromCatalog.mockRejectedValueOnce(new Error("EPUB download failed (502)"));
		view = await renderCard();
		await flush();
		await click(addButton() as HTMLButtonElement);
		await flush();

		expect(toastError).toHaveBeenCalledWith(
			expect.stringContaining("Frankenstein"),
			expect.objectContaining({ action: expect.objectContaining({ label: "Retry" }) }),
		);
		importFromCatalog.mockResolvedValueOnce({ book: { id: "local1" }, existed: false });
		const { action } = toastError.mock.calls[0]?.[1] as { action: { onClick: () => void } };
		action.onClick();
		await flush();
		expect(importFromCatalog).toHaveBeenCalledTimes(2);
	});
});
