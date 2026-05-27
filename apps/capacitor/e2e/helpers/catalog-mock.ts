import type { Page, Route } from "@playwright/test";

type RouteHandler = (route: Route) => unknown;

const CATALOG_HOST = "https://catalog.lesefluss.app";

export type CatalogMockOpts = {
	catalogId: string;
	title: string;
	author?: string;
	source?: "gutenberg" | "standard_ebooks";
	epubBytes: Buffer;
};

/**
 * Mock the catalog endpoints the app hits during a catalog import:
 *
 *   GET /books/:id        → CatalogBook JSON (one place that knows the shape)
 *   GET /books/epub/:id   → the EPUB bytes
 *
 * Keeps the response shape next to the test seam so a CatalogBook schema
 * change is caught here, not in 4 inline route blocks.
 */
export async function mockCatalogBook(page: Page, opts: CatalogMockOpts) {
	const detailUrl = `${CATALOG_HOST}/books/${encodeURIComponent(opts.catalogId)}`;
	const epubUrl = `${CATALOG_HOST}/books/epub/${encodeURIComponent(opts.catalogId)}`;

	const detailHandler: RouteHandler = (route) =>
		route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				id: opts.catalogId,
				source: opts.source ?? "gutenberg",
				title: opts.title,
				author: opts.author ?? "Mock Author",
				language: "en",
				subjects: [],
				summary: null,
				description: null,
				epubUrl,
				coverUrl: null,
			}),
		});

	const epubHandler: RouteHandler = (route) =>
		route.fulfill({
			status: 200,
			contentType: "application/epub+zip",
			headers: { "content-length": String(opts.epubBytes.length) },
			body: opts.epubBytes,
		});

	await page.route(detailUrl, detailHandler);
	await page.route(epubUrl, epubHandler);

	return {
		detailUrl,
		epubUrl,
		/** Unregister both route matchers. Tests that mock the catalog should
		 *  call this in their afterEach to keep handlers from leaking between
		 *  tests in the same worker. */
		cleanup: async () => {
			await page.unroute(detailUrl, detailHandler);
			await page.unroute(epubUrl, epubHandler);
		},
	};
}
