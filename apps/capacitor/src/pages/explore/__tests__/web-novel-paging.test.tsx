import { afterEach, describe, expect, it, vi } from "vitest";
import { click, type Rendered, render } from "../../../test/render";

const useSearchSerialPages = vi.hoisted(() => vi.fn());
const usePopularSerials = vi.hoisted(() => vi.fn());
const caps = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock("../../../services/serial-scrapers", () => ({
	chapterCountLabel: (n: number) => `${n} chapters`,
	providerLabel: (id: string) => (id === "royalroad" ? "Royal Road" : id),
	providerCapabilities: () => caps.current,
	normalizeSeriesUrl: (u: string) => u,
}));
vi.mock("../../../services/db/hooks", () => ({
	queryHooks: {
		useStatsMeasuredSpeed: () => ({ data: { wpm: 250, sessionCount: 3 } }),
		useSearchSerials: () => ({ data: undefined, isLoading: false, isFetching: false }),
		useSearchSerialPages,
		usePopularSerials,
		useSeriesList: () => ({ data: [] }),
		useImportSerialFromUrl: () => ({ mutateAsync: vi.fn() }),
	},
}));
vi.mock("../../../components/cloudflare-challenge", () => ({ CloudflareChallenge: () => null }));
vi.mock("@tanstack/react-router", () => ({ useRouter: () => ({ navigate: vi.fn() }) }));

const { WebNovelSearchPanel } = await import("../web-novel-search-panel");

const page = (titles: string[], failed: string[] = [], challenged: string[] = []) => ({
	results: titles.map((title) => ({
		title,
		provider: "royalroad",
		sourceUrl: `https://rr.test/${title}`,
	})),
	failedProviders: failed,
	challengeProviders: challenged,
});

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
	vi.clearAllMocks();
});

describe("web-novel search paging and filters", () => {
	it("pages a provider that supports it and passes the status filter", async () => {
		caps.current = { searchPaging: true, statusFilter: true };
		const fetchNextPage = vi.fn();
		useSearchSerialPages.mockReturnValue({
			data: { pages: [page(["A", "B"])] },
			hasNextPage: true,
			isFetchingNextPage: false,
			fetchNextPage,
		});
		view = await render(
			<WebNovelSearchPanel
				query="cradle"
				provider="royalroad"
				status="completed"
				viewMode="grid"
				onPick={vi.fn()}
			/>,
		);
		expect(useSearchSerialPages).toHaveBeenCalledWith("cradle", {
			provider: "royalroad",
			status: "completed",
			enabled: true,
		});
		expect(view.container.querySelectorAll('[data-testid="web-novel-card"]')).toHaveLength(2);
		await click(view.getButton("Load more"));
		expect(fetchNextPage).toHaveBeenCalled();
	});

	it("drops filters the provider does not support", async () => {
		caps.current = { searchPaging: true };
		useSearchSerialPages.mockReturnValue({ data: { pages: [page(["A"])] }, hasNextPage: false });
		view = await render(
			<WebNovelSearchPanel
				query="cradle"
				provider="ao3"
				status="completed"
				viewMode="grid"
				onPick={vi.fn()}
			/>,
		);
		expect(useSearchSerialPages).toHaveBeenCalledWith(
			"cradle",
			expect.objectContaining({ status: undefined }),
		);
		expect(view.queryButton("Load more")).toBeNull();
	});

	it("asks for the popular window only when the provider has windows", async () => {
		caps.current = { popularWindows: ["week", "trending", "all-time"] };
		usePopularSerials.mockReturnValue({ data: page(["Top"]), isLoading: false, isFetching: false });
		view = await render(
			<WebNovelSearchPanel
				query=""
				provider="royalroad"
				popularWindow="trending"
				viewMode="grid"
				onPick={vi.fn()}
			/>,
		);
		expect(usePopularSerials).toHaveBeenCalledWith("royalroad", "trending");
		view.unmount();
		caps.current = {};
		view = await render(
			<WebNovelSearchPanel
				query=""
				provider="ao3"
				popularWindow="trending"
				viewMode="grid"
				onPick={vi.fn()}
			/>,
		);
		expect(usePopularSerials).toHaveBeenLastCalledWith("ao3", undefined);
	});

	it("shows a provider failure on the first page as an error, not 'no results'", async () => {
		caps.current = { searchPaging: true };
		const refetch = vi.fn();
		useSearchSerialPages.mockReturnValue({
			data: { pages: [page([], ["royalroad"])] },
			hasNextPage: false,
			refetch,
		});
		view = await render(
			<WebNovelSearchPanel query="cradle" provider="royalroad" viewMode="grid" onPick={vi.fn()} />,
		);
		expect(view.text()).toContain("Royal Road didn't respond.");
		expect(view.text()).not.toContain("No results");
		await click(view.getButton("Retry"));
		expect(refetch).toHaveBeenCalled();
	});

	it("keeps loaded results and offers a retry when a later page fails", async () => {
		caps.current = { searchPaging: true };
		useSearchSerialPages.mockReturnValue({
			data: { pages: [page(["A", "B"]), page([], ["royalroad"])] },
			hasNextPage: false,
			refetch: vi.fn(),
		});
		view = await render(
			<WebNovelSearchPanel query="cradle" provider="royalroad" viewMode="grid" onPick={vi.fn()} />,
		);
		expect(view.container.querySelectorAll('[data-testid="web-novel-card"]')).toHaveLength(2);
		expect(view.text()).toContain("The next page didn't load.");
	});

	it("dedupes series repeated across pages", async () => {
		caps.current = { searchPaging: true };
		useSearchSerialPages.mockReturnValue({
			data: { pages: [page(["A", "B"]), page(["B", "C"])] },
			hasNextPage: false,
		});
		view = await render(
			<WebNovelSearchPanel query="cradle" provider="royalroad" viewMode="grid" onPick={vi.fn()} />,
		);
		expect(view.container.querySelectorAll('[data-testid="web-novel-card"]')).toHaveLength(3);
	});

	it("shows a skeleton while the first page is pending", async () => {
		caps.current = { searchPaging: true };
		useSearchSerialPages.mockReturnValue({ isPending: true });
		view = await render(
			<WebNovelSearchPanel query="cradle" provider="royalroad" viewMode="grid" onPick={vi.fn()} />,
		);
		expect(view.container.querySelector('[role="status"]')).not.toBeNull();
	});
});
