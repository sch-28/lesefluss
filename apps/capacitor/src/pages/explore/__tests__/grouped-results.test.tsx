import { afterEach, describe, expect, it, vi } from "vitest";
import type { SearchAllResult, SearchResult } from "../../../services/serial-scrapers";
import { click, flush, type Rendered, render } from "../../../test/render";

const searchCatalog = vi.hoisted(() => vi.fn());
const serials = vi.hoisted(() => ({
	current: {} as {
		data?: SearchAllResult;
		isLoading?: boolean;
		isFetching?: boolean;
		isSuccess?: boolean;
		isError?: boolean;
		refetch: () => void;
	},
}));

vi.mock("../../../services/catalog/client", async (importActual) => ({
	...(await importActual<typeof import("../../../services/catalog/client")>()),
	searchCatalog,
}));
vi.mock("../../../services/catalog/import", () => ({ importFromCatalog: vi.fn() }));
vi.mock("../../../services/serial-scrapers", async (importActual) => ({
	normalizeSeriesUrl: (
		await importActual<typeof import("../../../services/serial-scrapers/utils/series-url")>()
	).normalizeSeriesUrl,
	providerLabel: (id: string) => ({ royalroad: "Royal Road", ao3: "AO3" })[id] ?? id,
	chapterCountLabel: (n: number) => `${n} chapters`,
}));
vi.mock("../../../services/db/hooks", () => ({
	queryHooks: {
		useStatsMeasuredSpeed: () => ({ data: { wpm: 300, sessionCount: 12 } }),
		useSearchSerials: () => serials.current,
		useLibraryCatalogIds: () => ({ data: new Map() }),
		useSeriesList: () => ({ data: [] }),
		useImportSerialFromUrl: () => ({ mutateAsync: vi.fn() }),
	},
}));
vi.mock("../../../services/sync", () => ({ scheduleSyncPush: vi.fn() }));
vi.mock("../../../components/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../../../components/cloudflare-challenge", () => ({ CloudflareChallenge: () => null }));
vi.mock("@tanstack/react-router", () => ({ useRouter: () => ({ navigate: vi.fn() }) }));

const { default: GroupedResults } = await import("../grouped-results");

const novel = (provider: SearchResult["provider"], title: string): SearchResult => ({
	title,
	provider,
	sourceUrl: `https://${provider}.test/${title}`,
});

const catalogPage = (titles: string[]) => ({
	q: "cradle",
	lang: "en",
	genre: null,
	sort: "relevance",
	page: 1,
	limit: 8,
	total: titles.length,
	results: titles.map((title, i) => ({
		id: `gutenberg:${i}`,
		source: "gutenberg",
		title,
		author: null,
		language: "en",
		subjects: [],
		summary: null,
		coverUrl: null,
		hasEpub: true,
	})),
	suggestion: titles.length === 0 ? "Cranford" : null,
});

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
	vi.clearAllMocks();
});

const handlers = () => ({
	onOpenBook: vi.fn(),
	onOpenWebNovel: vi.fn(),
	onSeeAllCatalog: vi.fn(),
	onSeeAllProvider: vi.fn(),
	onSearchSuggestion: vi.fn(),
	onSearchAllLanguages: vi.fn(),
});

describe("GroupedResults", () => {
	it("shows one section per source, each with See all", async () => {
		searchCatalog.mockResolvedValue(catalogPage(["Cradle Song"]));
		serials.current = {
			data: {
				results: [
					novel("royalroad", "Cradle"),
					novel("ao3", "Cradle fic"),
					novel("royalroad", "Cradle 2"),
				],
				failedProviders: [],
				challengeProviders: [],
			},
			isSuccess: true,
			refetch: vi.fn(),
		};
		const h = handlers();
		view = await render(<GroupedResults q="cradle" lang="en" {...h} />);
		await flush();

		expect(view.text()).toContain("Public domain (1)");
		expect(view.text()).toContain("Cradle Song");
		const rr = view.container.querySelector('[data-testid="provider-group-royalroad"]');
		expect(rr?.textContent).toContain("Royal Road");
		expect(rr?.querySelectorAll('[data-testid="web-novel-card"]')).toHaveLength(2);
		expect(view.container.querySelector('[data-testid="provider-group-ao3"]')).not.toBeNull();

		const seeAll = [...view.container.querySelectorAll("button")].filter((b) =>
			b.textContent?.includes("See all"),
		);
		expect(seeAll).toHaveLength(3);
		await click(seeAll[0] as HTMLButtonElement);
		expect(h.onSeeAllCatalog).toHaveBeenCalled();
		await click(seeAll[1] as HTMLButtonElement);
		expect(h.onSeeAllProvider).toHaveBeenCalledWith("royalroad");
	});

	it("shows catalog results while providers are still searching", async () => {
		searchCatalog.mockResolvedValue(catalogPage(["Cradle Song"]));
		serials.current = { isLoading: true, isFetching: true, refetch: vi.fn() };
		view = await render(<GroupedResults q="cradle" lang="en" {...handlers()} />);
		await flush();
		expect(view.text()).toContain("Cradle Song");
		expect(view.container.querySelector('[role="status"][aria-busy="true"]')).not.toBeNull();
	});

	it("names failed providers inline and keeps everything else", async () => {
		searchCatalog.mockResolvedValue(catalogPage(["Cradle Song"]));
		const refetch = vi.fn();
		serials.current = {
			data: {
				results: [novel("ao3", "Cradle fic")],
				failedProviders: ["royalroad"],
				challengeProviders: [],
			},
			isSuccess: true,
			refetch,
		};
		view = await render(<GroupedResults q="cradle" lang="en" {...handlers()} />);
		await flush();
		expect(view.text()).toContain("Royal Road didn't respond.");
		expect(view.text()).toContain("Cradle Song");
		expect(view.text()).toContain("Cradle fic");
		await click(view.getButton("Retry"));
		expect(refetch).toHaveBeenCalled();
	});

	it("offers a spelling suggestion and all languages when nothing matched anywhere", async () => {
		searchCatalog.mockResolvedValue(catalogPage([]));
		serials.current = {
			data: { results: [], failedProviders: [], challengeProviders: [] },
			isSuccess: true,
			refetch: vi.fn(),
		};
		const h = handlers();
		view = await render(<GroupedResults q="crnaford" lang="en" {...h} />);
		await flush();
		await click(view.getButton('Search for "Cranford"'));
		expect(h.onSearchSuggestion).toHaveBeenCalledWith("Cranford");
		await click(view.getButton("Search all languages"));
		expect(h.onSearchAllLanguages).toHaveBeenCalled();
	});
});
