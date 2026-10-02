import { describe, expect, it, vi } from "vitest";
import type { SearchResult } from "../../../services/serial-scrapers";

vi.mock("../../../services/serial-scrapers", () => ({ previewSerial: vi.fn() }));
const { mergePreview } = await import("../use-serial-preview");

const listing: SearchResult = {
	title: "Mother of Learning",
	sourceUrl: "https://www.royalroad.com/fiction/21220/mother-of-learning",
	provider: "royalroad",
	chapterCount: 109,
	details: { wordCount: 806_300, wordCountEstimated: true },
};

describe("mergePreview", () => {
	it("takes the series page's exact word count over the listing estimate", () => {
		const page: SearchResult = { ...listing, chapterCount: null, details: { wordCount: 806_306 } };
		expect(mergePreview(listing, page)).toMatchObject({
			chapterCount: 109,
			details: { wordCount: 806_306 },
		});
		expect(mergePreview(listing, page).details?.wordCountEstimated).toBeUndefined();
	});

	it("keeps the listing estimate when the series page has no word count", () => {
		const page: SearchResult = { ...listing, chapterCount: null, details: { followers: 33_889 } };
		expect(mergePreview(listing, page).details).toEqual({
			followers: 33_889,
			wordCount: 806_300,
			wordCountEstimated: true,
		});
	});
});
