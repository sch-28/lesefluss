import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogLandingResponse, CatalogSearchResult } from "../../../services/catalog/client";
import { click, flush, type Rendered, render } from "../../../test/render";

const getLanding = vi.hoisted(() => vi.fn());
const getRandomShelf = vi.hoisted(() => vi.fn());
const getGenres = vi.hoisted(() => vi.fn());
const popular = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock("../../../services/catalog/client", async (importActual) => ({
	...(await importActual<typeof import("../../../services/catalog/client")>()),
	getLanding,
	getRandomShelf,
	getGenres,
}));
vi.mock("../../../services/catalog/import", () => ({ importFromCatalog: vi.fn() }));
vi.mock("../../../services/db/hooks", () => ({
	queryHooks: {
		useSettings: () => ({ data: { wpm: 300 } }),
		useLibraryCatalogIds: () => ({ data: new Map() }),
		useSeriesList: () => ({ data: [] }),
		useImportSerialFromUrl: () => ({ mutateAsync: vi.fn() }),
		usePopularSerials: () => popular.current,
	},
}));
vi.mock("../../../services/sync", () => ({ scheduleSyncPush: vi.fn() }));
vi.mock("../../../services/serial-scrapers", () => ({
	providerLabel: (id: string) => id,
	chapterCountLabel: (n: number) => `${n} chapters`,
	normalizeSeriesUrl: (u: string) => u,
}));
vi.mock("../../../components/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../web-novels-section", () => ({ default: () => <div>Providers</div> }));
vi.mock("@tanstack/react-router", () => ({ useRouter: () => ({ navigate: vi.fn() }) }));

const { default: ExploreLanding } = await import("../landing");

const book = (id: string, title: string): CatalogSearchResult => ({
	id,
	source: "gutenberg",
	title,
	author: null,
	language: "en",
	subjects: [],
	summary: null,
	coverUrl: null,
});

const LANDING: CatalogLandingResponse = {
	lang: "en",
	featured_se: [book("se:a/b", "SE Pick")],
	classics: [book("gutenberg:1342", "Pride and Prejudice")],
	most_read: [book("gutenberg:2701", "Moby Dick")],
	recently_added: [book("gutenberg:99", "Fresh Arrival")],
	genres: [{ id: "horror", label: "Horror & Gothic", books: [book("gutenberg:345", "Dracula")] }],
	failed: [],
};

let view: Rendered | undefined;
beforeEach(() => {
	getRandomShelf.mockResolvedValue({ results: [] });
	getGenres.mockResolvedValue({
		lang: "en",
		genres: [
			{ id: "horror", label: "Horror & Gothic", count: 3 },
			{ id: "essays", label: "Essays", count: 0 },
		],
	});
	popular.current = {
		isSuccess: true,
		data: {
			results: [{ title: "Cradle", provider: "royalroad", sourceUrl: "https://rr.test/cradle" }],
			failedProviders: [],
			challengeProviders: [],
		},
		refetch: vi.fn(),
	};
});
afterEach(() => {
	view?.unmount();
	view = undefined;
	vi.clearAllMocks();
});

const renderLanding = (onBrowse = vi.fn()) =>
	render(
		<ExploreLanding
			lang="en"
			onOpen={vi.fn()}
			onOpenWebNovel={vi.fn()}
			onBrowse={onBrowse}
			onBrowseTags={vi.fn()}
		/>,
	);

const sectionTitled = (title: string) =>
	[...(view?.container.querySelectorAll("section") ?? [])].find(
		(s) => s.querySelector("h2")?.textContent === title,
	);

describe("Explore landing", () => {
	it("leads with genre tiles from the API and drops the old bottom grid", async () => {
		getLanding.mockResolvedValue(LANDING);
		view = await renderLanding();
		await flush();
		const nav = view.container.querySelector('nav[aria-label="Browse"]');
		expect(nav?.textContent).toContain("Browse by tag");
		expect(nav?.textContent).toContain("Horror & Gothic");
		expect(nav?.textContent).not.toContain("Essays");
		expect(view.text()).not.toContain("Browse genres");
	});

	it("shows recently added, trending web novels and every shelf with See all", async () => {
		getLanding.mockResolvedValue(LANDING);
		const onBrowse = vi.fn();
		view = await renderLanding(onBrowse);
		await flush();
		expect(view.text()).toContain("Fresh Arrival");
		expect(view.text()).toContain("Cradle");
		for (const [title, search] of [
			["Recently added", { scope: "catalog", sort: "recent" }],
			["Most read", { scope: "catalog", sort: "popular" }],
			["New from Standard Ebooks", { source: "standard_ebooks", sort: "recent" }],
			["Horror & Gothic", { genre: "horror" }],
			["Random picks", { source: "standard_ebooks" }],
		] as const) {
			const seeAll = [...(sectionTitled(title)?.querySelectorAll("button") ?? [])].find((b) =>
				b.textContent?.includes("See all"),
			);
			expect(seeAll, title).toBeDefined();
			await click(seeAll as HTMLButtonElement);
			expect(onBrowse).toHaveBeenLastCalledWith(search);
		}
		expect(sectionTitled("Trending web novels")).toBeDefined();
	});

	it("keeps the rest of the landing when one shelf failed on the server", async () => {
		getLanding.mockResolvedValue({ ...LANDING, most_read: [], failed: ["most_read"] });
		view = await renderLanding();
		await flush();
		expect(sectionTitled("Most read")?.textContent).toContain("Something went wrong");
		expect(view.text()).toContain("Fresh Arrival");
		expect(view.text()).toContain("Dracula");
	});

	it("keeps browsing and web novels when the catalog landing fails entirely", async () => {
		getLanding.mockRejectedValue(new Error("Landing fetch failed (502)"));
		view = await renderLanding();
		await flush();
		expect(view.text()).toContain("Something went wrong");
		expect(view.text()).toContain("Browse by tag");
		expect(view.text()).toContain("Cradle");
		expect(view.text()).toContain("Providers");
	});

	it("puts web novels right under the hero and personal shelves, before catalog shelves", async () => {
		getLanding.mockResolvedValue(LANDING);
		view = await render(
			<ExploreLanding
				lang="en"
				onOpen={vi.fn()}
				onOpenWebNovel={vi.fn()}
				onBrowse={vi.fn()}
				onBrowseTags={vi.fn()}
				personalShelves={<div>Personal shelves</div>}
			/>,
		);
		await flush();
		const text = view.text();
		const order = [
			"Featured",
			"Personal shelves",
			"Trending web novels",
			"Providers",
			"Recently added",
		].map((marker) => text.indexOf(marker));
		expect(order.every((i) => i >= 0)).toBe(true);
		expect([...order].sort((a, b) => a - b)).toEqual(order);
	});

	it("keeps the provider cards when trending web novels fail", async () => {
		getLanding.mockResolvedValue(LANDING);
		popular.current = { isError: true, error: new Error("down"), refetch: vi.fn() };
		view = await renderLanding();
		await flush();
		expect(sectionTitled("Trending web novels")?.textContent).toContain("Something went wrong");
		expect(view.text()).toContain("Providers");
		expect(view.text()).toContain("Fresh Arrival");
	});

	it("shows skeletons, not a spinner, while loading", async () => {
		getLanding.mockImplementation(() => new Promise(() => undefined));
		view = await renderLanding();
		expect(view.container.querySelectorAll('[role="status"]').length).toBeGreaterThanOrEqual(3);
		expect(view.container.querySelector(".animate-spin")).toBeNull();
	});
});
