import { afterEach, describe, expect, it, vi } from "vitest";
import type { SearchResult } from "../../../services/serial-scrapers";
import { click, type Rendered, render } from "../../../test/render";

const importMutate = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());

const owned: SearchResult = {
	title: "Owned Series",
	sourceUrl: "https://www.royalroad.com/fiction/1/owned",
	provider: "royalroad",
};
const fresh: SearchResult = {
	title: "Fresh Series",
	sourceUrl: "https://www.royalroad.com/fiction/2/fresh",
	provider: "royalroad",
};

vi.mock("../../../services/serial-scrapers", async (importActual) => ({
	normalizeSeriesUrl: (
		await importActual<typeof import("../../../services/serial-scrapers/utils/series-url")>()
	).normalizeSeriesUrl,
	chapterCountLabel: (n: number) => `${n} chapters`,
	providerCapabilities: () => ({}),
}));
vi.mock("../../../services/db/hooks", () => ({
	queryHooks: {
		usePopularSerials: () => ({
			data: { results: [owned, fresh], failedProviders: [], challengeProviders: [] },
			isLoading: false,
			isFetching: false,
			isError: false,
			refetch: vi.fn(),
		}),
		useSearchSerials: () => ({ data: undefined, isLoading: false, isFetching: false }),
		useSeriesList: () => ({
			data: [{ id: "s1", sourceUrl: "https://royalroad.com/fiction/1/owned/" }],
		}),
		useImportSerialFromUrl: () => ({ mutateAsync: importMutate }),
	},
}));
vi.mock("../../../components/toast", () => ({
	toast: { success: toastSuccess, error: vi.fn(), info: vi.fn() },
}));
vi.mock("../../../components/cloudflare-challenge", () => ({ CloudflareChallenge: () => null }));
vi.mock("@tanstack/react-router", () => ({ useRouter: () => ({ navigate: vi.fn() }) }));

const { WebNovelSearchPanel } = await import("../web-novel-search-panel");

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
	vi.clearAllMocks();
});

const cards = () => [...(view?.container.querySelectorAll('[data-testid="web-novel-card"]') ?? [])];

describe.each(["grid", "list"] as const)("web-novel cards (%s)", (viewMode) => {
	it("marks owned series and offers quick add only for the rest", async () => {
		view = await render(<WebNovelSearchPanel query="" viewMode={viewMode} onPick={vi.fn()} />);
		const [ownedCard, freshCard] = cards();
		expect(ownedCard?.getAttribute("data-in-library")).toBe("true");
		expect(ownedCard?.textContent).toContain("In library");
		expect(freshCard?.getAttribute("data-in-library")).toBe("false");
		expect(view.queryButton("Add Owned Series to library")).toBeNull();
		expect(view.queryButton("Add Fresh Series to library")).not.toBeNull();
	});

	it("stands in a typographic cover for series without art", async () => {
		view = await render(<WebNovelSearchPanel query="" viewMode={viewMode} onPick={vi.fn()} />);
		const covers = view.container.querySelectorAll('[data-testid="text-cover"]');
		expect(covers.length).toBe(2);
		expect(covers[0]?.textContent).toContain("Owned Series");
	});

	it("quick add imports the series without opening the preview", async () => {
		const onPick = vi.fn();
		view = await render(<WebNovelSearchPanel query="" viewMode={viewMode} onPick={onPick} />);
		importMutate.mockResolvedValueOnce({ id: "s2" });
		await click(view.getButton("Add Fresh Series to library"));
		expect(importMutate).toHaveBeenCalledWith({ url: fresh.sourceUrl });
		expect(onPick).not.toHaveBeenCalled();
		expect(toastSuccess).toHaveBeenCalledWith(
			expect.stringContaining("Fresh Series"),
			expect.objectContaining({ action: expect.objectContaining({ label: "Open" }) }),
		);
	});
});
