import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchResult } from "../../../services/serial-scrapers";
import { click, flush, type Rendered, render } from "../../../test/render";

const previewSerial = vi.hoisted(() => vi.fn());
const shareLink = vi.hoisted(() => vi.fn());
const navigate = vi.hoisted(() => vi.fn());
const importMutate = vi.hoisted(() => vi.fn());
const search = vi.hoisted(() => ({ current: {} as { url?: string } }));
const seriesList = vi.hoisted(() => ({ current: [] as { id: string; sourceUrl: string }[] }));

vi.mock("../../../services/serial-scrapers", async (importActual) => ({
	normalizeSeriesUrl: (
		await importActual<typeof import("../../../services/serial-scrapers/utils/series-url")>()
	).normalizeSeriesUrl,
	isSerialUrl: (url: string) => url.includes("royalroad.com"),
	previewSerial,
	providerLabel: (id: string) => (id === "royalroad" ? "Royal Road" : id),
	chapterCountLabel: (n: number) => `${n} chapters`,
}));
vi.mock("../../../services/db/hooks", () => ({
	queryHooks: {
		useStatsMeasuredSpeed: () => ({ data: { wpm: 250, sessionCount: 3 } }),
		useSeriesList: () => ({ data: seriesList.current }),
		useImportSerialFromUrl: () => ({ mutateAsync: importMutate }),
	},
}));
vi.mock("../../../components/toast", () => ({
	toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@tanstack/react-router", () => ({
	useRouter: () => ({ navigate, history: { back: vi.fn() } }),
}));
vi.mock("../../../components/app-shell/page-header", () => ({
	PageHeader: ({ title, right }: { title: string; right?: React.ReactNode }) => (
		<header>
			<h1>{title}</h1>
			{right}
		</header>
	),
}));
vi.mock("../share-link", () => ({ shareLink }));

const { default: WebNovelPreview } = await import("../web-novel-preview");
const { previewCache } = await import("../preview-cache");

const URL_ = "https://www.royalroad.com/fiction/21220/mother-of-learning";

const RESULT: SearchResult = {
	title: "Mother of Learning",
	author: "nobody103",
	description: "A time loop story.",
	coverImage: "https://covers.test/mol.jpg",
	chapterCount: 108,
	sourceUrl: URL_,
	provider: "royalroad",
};

let view: Rendered | undefined;
beforeEach(() => {
	search.current = { url: URL_ };
	seriesList.current = [];
});
afterEach(() => {
	view?.unmount();
	view = undefined;
	previewCache.clear();
	vi.clearAllMocks();
});

describe("WebNovelPreview", () => {
	it("renders straight from the cache after a search tap while details load", async () => {
		previewCache.set(RESULT);
		previewSerial.mockImplementation(() => new Promise(() => undefined));
		view = await render(<WebNovelPreview search={search.current} />);
		expect(view.text()).toContain("Mother of Learning");
		expect(view.text()).toContain("108 chapters");
		expect(view.queryButton(/Add to library/)).not.toBeNull();
		expect(previewSerial).toHaveBeenCalledWith(URL_);
	});

	it("keeps the listing's chapter count once the details arrive", async () => {
		previewCache.set(RESULT);
		previewSerial.mockResolvedValueOnce({
			...RESULT,
			chapterCount: null,
			details: { status: "completed" },
		});
		view = await render(<WebNovelPreview search={search.current} />);
		await flush();
		expect(view.text()).toContain("Completed");
		expect(view.text()).toContain("108 chapters");
	});

	it("keeps the cached entry when the details fetch fails", async () => {
		previewCache.set(RESULT);
		previewSerial.mockRejectedValueOnce(new Error("HTTP 503"));
		view = await render(<WebNovelPreview search={search.current} />);
		await flush();
		expect(view.text()).toContain("Mother of Learning");
		expect(view.text()).not.toContain("Couldn't load preview");
	});

	it("shows status, stats and tags the provider supplies", async () => {
		previewSerial.mockResolvedValueOnce({
			...RESULT,
			details: {
				status: "completed",
				rating: 4.83,
				ratingCount: 17569,
				followers: 33886,
				lastUpdated: "2023-07-06",
				tags: ["Time Loop", "Fantasy"],
			},
		});
		view = await render(<WebNovelPreview search={search.current} />);
		await flush();
		for (const fact of ["Completed", "★ 4.83 (17,569)", "33,886 followers", "Updated 2023-07-06"]) {
			expect(view.text()).toContain(fact);
		}
		expect(view.text()).toContain("Time Loop");
	});

	it("shows AO3's rating, warnings, fandoms and relationships", async () => {
		previewSerial.mockResolvedValueOnce({
			...RESULT,
			provider: "ao3",
			details: {
				wordCount: 21911,
				ao3: {
					rating: ["General Audiences"],
					warnings: ["No Archive Warnings Apply"],
					fandoms: ["Sherlock (TV)"],
					relationships: ["Sherlock Holmes/John Watson"],
				},
			},
		});
		view = await render(<WebNovelPreview search={search.current} />);
		await flush();
		const meta = view.container.querySelector('[data-testid="ao3-meta"]');
		expect(meta?.textContent).toContain("General Audiences");
		expect(meta?.textContent).toContain("No Archive Warnings Apply");
		expect(meta?.textContent).toContain("Sherlock (TV)");
		expect(meta?.textContent).toContain("Sherlock Holmes/John Watson");
		// 21,911 words at 250 words a page and the mocked 250 wpm.
		expect(view.text()).toContain("88 pages · 1h 28m");
	});

	it("fetches title, author, cover and description on a cold link", async () => {
		previewSerial.mockResolvedValueOnce({ ...RESULT, chapterCount: null });
		view = await render(<WebNovelPreview search={search.current} />);
		await flush();

		expect(previewSerial).toHaveBeenCalledWith(URL_);
		expect(view.text()).toContain("Mother of Learning");
		expect(view.text()).toContain("nobody103");
		expect(view.text()).toContain("A time loop story.");
		const cover = view.container.querySelector("img");
		// Web builds route covers through the catalog image proxy.
		expect(decodeURIComponent(cover?.getAttribute("src") ?? "")).toContain("covers.test/mol.jpg");
		expect(view.queryButton(/Add to library/)).not.toBeNull();
	});

	it("shows loading on a cold link until the provider answers", async () => {
		previewSerial.mockImplementation(() => new Promise(() => undefined));
		view = await render(<WebNovelPreview search={search.current} />);
		expect(view.text()).toContain("Loading...");
		expect(view.container.querySelector(".animate-spin")).not.toBeNull();
	});

	it("offers Retry and the source link when the cold fetch fails", async () => {
		previewSerial.mockRejectedValueOnce(new Error("HTTP 503"));
		view = await render(<WebNovelPreview search={search.current} />);
		await flush();

		expect(view.text()).toContain("Couldn't load preview");
		const sourceLinks = [...view.container.querySelectorAll("a")].map((a) =>
			a.getAttribute("href"),
		);
		expect(sourceLinks).toContain(URL_);

		previewSerial.mockResolvedValueOnce(RESULT);
		await click(view.getButton("Retry"));
		expect(previewSerial).toHaveBeenCalledTimes(2);
		expect(view.text()).toContain("Mother of Learning");
	});

	it("refuses a URL no provider handles, so it never links out to it", async () => {
		search.current = { url: "https://evil.test/phish" };
		view = await render(<WebNovelPreview search={search.current} />);
		expect(view.text()).toContain("Preview unavailable");
		expect(view.container.querySelector('a[href^="https://evil.test"]')).toBeNull();
		expect(previewSerial).not.toHaveBeenCalled();
	});

	it("shares the provider's page for the series", async () => {
		previewCache.set(RESULT);
		previewSerial.mockImplementation(() => new Promise(() => undefined));
		view = await render(<WebNovelPreview search={search.current} />);
		await click(view.getButton("Share"));
		expect(shareLink).toHaveBeenCalledWith("Mother of Learning", URL_, "Share web novel");
	});

	it("opens the library series instead of adding a duplicate", async () => {
		// Stored URL differs only in scheme/host spelling and trailing slash.
		seriesList.current = [
			{ id: "s1", sourceUrl: "https://royalroad.com/fiction/21220/mother-of-learning/" },
		];
		previewCache.set(RESULT);
		view = await render(<WebNovelPreview search={search.current} />);

		expect(view.queryButton(/Add to library/)).toBeNull();
		await click(view.getButton(/Open in Library/));
		expect(navigate).toHaveBeenCalledWith({
			to: "/tabs/library/series/$id",
			params: { id: "s1" },
		});
		expect(importMutate).not.toHaveBeenCalled();
	});
});
