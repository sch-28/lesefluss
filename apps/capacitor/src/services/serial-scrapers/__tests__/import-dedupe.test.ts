import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchSeriesMetadata = vi.hoisted(() => vi.fn());
const fetchChapterList = vi.hoisted(() => vi.fn());
const commitSeries = vi.hoisted(() => vi.fn());
const clearImportedFromWishlist = vi.hoisted(() => vi.fn());

vi.mock("../registry", () => ({
	detectScraper: () => ({ id: "royalroad", fetchSeriesMetadata, fetchChapterList }),
	scrapersById: {},
}));
vi.mock("../commit", () => ({ commitSeries, commitChapter: vi.fn(), syncChapterList: vi.fn() }));
vi.mock("../../db/queries", () => ({ queries: {} }));
vi.mock("../../wishlist", () => ({ clearImportedFromWishlist }));

const { runSerialImport } = await import("../pipeline");

beforeEach(() => {
	vi.clearAllMocks();
	fetchSeriesMetadata.mockResolvedValue({ tocUrl: "toc" });
	fetchChapterList.mockResolvedValue([{ index: 0, title: "1", sourceUrl: "c1" }]);
	commitSeries.mockResolvedValue({ id: "s1", sourceUrl: "https://www.royalroad.com/fiction/1/x" });
});

describe("runSerialImport", () => {
	it("shares one import for two spellings of the same series URL", async () => {
		const [a, b] = await Promise.all([
			runSerialImport("https://www.royalroad.com/fiction/1/x"),
			runSerialImport("https://royalroad.com/fiction/1/x/"),
		]);
		expect(commitSeries).toHaveBeenCalledTimes(1);
		expect(a).toBe(b);
	});

	it("imports again after the first one settled", async () => {
		await runSerialImport("https://royalroad.com/fiction/1/x");
		await runSerialImport("https://royalroad.com/fiction/1/x");
		expect(commitSeries).toHaveBeenCalledTimes(2);
	});

	it("takes the series off the wishlist under both spellings once it is in", async () => {
		await runSerialImport("https://royalroad.com/fiction/1/x/chapter/9");
		expect(clearImportedFromWishlist).toHaveBeenCalledWith("serial", [
			"https://royalroad.com/fiction/1/x/chapter/9",
			"https://www.royalroad.com/fiction/1/x",
		]);
	});

	it("leaves the wishlist alone when the import fails", async () => {
		fetchChapterList.mockResolvedValue([]);
		await expect(runSerialImport("https://royalroad.com/fiction/1/x")).rejects.toThrow();
		expect(clearImportedFromWishlist).not.toHaveBeenCalled();
	});
});
