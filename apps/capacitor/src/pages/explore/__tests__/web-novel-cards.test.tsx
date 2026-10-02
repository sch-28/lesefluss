import { afterEach, describe, expect, it, vi } from "vitest";
import type { SearchResult } from "../../../services/serial-scrapers";
import { click, type Rendered, render } from "../../../test/render";

const importMutate = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());

const owned: SearchResult = {
	title: "Owned Series",
	sourceUrl: "https://www.royalroad.com/fiction/1/owned",
	provider: "royalroad",
	chapterCount: 42,
};
const fresh: SearchResult = {
	title: "Fresh Series",
	sourceUrl: "https://www.royalroad.com/fiction/2/fresh",
	provider: "royalroad",
	chapterCount: 7,
	details: { wordCount: 33_000, wordCountEstimated: true },
};

vi.mock("../../../services/serial-scrapers", async (importActual) => ({
	normalizeSeriesUrl: (
		await importActual<typeof import("../../../services/serial-scrapers/utils/series-url")>()
	).normalizeSeriesUrl,
	chapterCountLabel: (n: number) => `${n} chapters`,
	providerLabel: (id: string) => `Provider ${id}`,
	providerCapabilities: () => ({}),
}));
vi.mock("../../../services/db/hooks", () => ({
	queryHooks: {
		useStatsMeasuredSpeed: () => ({ data: { wpm: 250, sessionCount: 3 } }),
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
	it("shows the length from the provider's words, else chapters", async () => {
		view = await render(<WebNovelSearchPanel query="" viewMode={viewMode} onPick={vi.fn()} />);
		const [ownedCard, freshCard] = cards();
		if (viewMode === "grid") {
			const badge = freshCard?.querySelector('[data-testid="cover-length-badge"]');
			expect(badge?.textContent).toContain("~2h 12m");
			expect(badge?.querySelector(".sr-only")?.textContent).toBe(
				"About 2 hours 12 minutes to read",
			);
			expect(ownedCard?.querySelector('[data-testid="cover-length-badge"]')).toBeNull();
		} else {
			expect(freshCard?.textContent).toContain("~132 pages · 2h 12m");
		}
		expect(freshCard?.textContent).not.toContain("chapters");
		expect(ownedCard?.textContent).toContain("42 chapters");
	});

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

describe("web-novel grid card provider name", () => {
	it("is muted text under the title in a mixed list, and absent where a heading names the provider", async () => {
		const { WebNovelCard } = await import("../web-novel-card");
		view = await render(<WebNovelCard result={fresh} onPick={vi.fn()} showProvider />);
		expect(view.text()).toContain("Provider royalroad");
		view.unmount();
		view = await render(<WebNovelCard result={fresh} onPick={vi.fn()} showProvider={false} />);
		expect(view.text()).not.toContain("Provider royalroad");
	});
});
