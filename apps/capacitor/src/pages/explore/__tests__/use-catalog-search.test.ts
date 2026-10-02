import { describe, expect, it } from "vitest";
import type { CatalogSearchResponse } from "../../../services/catalog/client";
import { nextCatalogPage } from "../use-catalog-search";

const page = (n: number, limit: number, total: number, count = limit): CatalogSearchResponse => ({
	q: "",
	lang: "en",
	genre: null,
	sort: "popular",
	page: n,
	limit,
	total,
	results: Array.from({ length: count }, (_, i) => ({
		id: `gutenberg:${n * 1000 + i}`,
		source: "gutenberg",
		title: "t",
		author: null,
		language: "en",
		subjects: null,
		summary: null,
		coverUrl: null,
	})),
});

describe("nextCatalogPage", () => {
	it("asks for the next page while results remain", () => {
		expect(nextCatalogPage(page(1, 24, 100), [page(1, 24, 100)])).toBe(2);
	});

	it("stops once everything is loaded", () => {
		expect(
			nextCatalogPage(page(2, 24, 30, 6), [page(1, 24, 30), page(2, 24, 30, 6)]),
		).toBeUndefined();
	});

	it("stops at the catalog's offset cap instead of earning a 400", () => {
		const last = page(417, 24, 50_000);
		expect(
			nextCatalogPage(
				last,
				Array.from({ length: 417 }, (_, i) => page(i + 1, 24, 50_000)),
			),
		).toBeUndefined();
		expect(nextCatalogPage(page(416, 24, 50_000), [page(416, 24, 50_000)])).toBe(417);
	});
});
