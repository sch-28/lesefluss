import type { RawInput } from "@lesefluss/book-import";
import { describe, expect, it, vi } from "vitest";
import {
	type ArticleImportDeps,
	handleArticleImportRequest,
	handleArticleLookupRequest,
} from "./article-import";

function jsonRequest(body: unknown): Request {
	return new Request("https://lesefluss.test/api/import/article", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

function testDeps(overrides: ArticleImportDeps = {}): ArticleImportDeps & {
	insertBook: NonNullable<ArticleImportDeps["insertBook"]>;
} {
	return {
		generateBookId: () => "a1b2c3d4",
		checkLimit: () => ({ ok: true }),
		insertBook: vi.fn(async () => true),
		...overrides,
	};
}

describe("handleArticleImportRequest", () => {
	it("rejects invalid payloads", async () => {
		const res = await handleArticleImportRequest(
			jsonRequest({ html: "<p>Missing URL</p>" }),
			"u1",
			testDeps(),
		);

		expect(res.status).toBe(400);
		await expect(res.json()).resolves.toMatchObject({ error: "Invalid payload" });
	});

	it("does not fall back to URL import when an HTML payload is invalid", async () => {
		const fetchUrl = vi.fn();
		const res = await handleArticleImportRequest(
			jsonRequest({ html: "", url: "https://example.com/read" }),
			"u1",
			testDeps({ fetchUrl }),
		);

		expect(res.status).toBe(400);
		expect(fetchUrl).not.toHaveBeenCalled();
	});

	it("rejects imports with no readable content", async () => {
		const deps = testDeps();
		const res = await handleArticleImportRequest(
			jsonRequest({ html: "<html><body></body></html>", url: "https://example.com/read" }),
			"u1",
			deps,
		);

		expect(res.status).toBe(422);
		await expect(res.json()).resolves.toEqual({ error: "Article has no readable content" });
		expect(deps.insertBook).not.toHaveBeenCalled();
	});

	it("imports rendered HTML into sync_books shape", async () => {
		const deps = testDeps();
		const res = await handleArticleImportRequest(
			jsonRequest({
				html: "<html><head><title>Parsed Title</title></head><body><article><p>Hello article body.</p></article></body></html>",
				url: "https://example.com/read",
				title: "Extension Title",
			}),
			"user-1",
			deps,
		);

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({ id: "a1b2c3d4" });
		expect(deps.insertBook).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: "user-1",
				bookId: "a1b2c3d4",
				title: "Extension Title",
				content: "Hello article body.",
				fileSize: 19,
				wordCount: 3,
				position: 0,
				source: "url",
				sourceUrl: "https://example.com/read",
				deleted: false,
				chapterStatus: "fetched",
			}),
		);
	});

	it("fetches URL imports through the catalog proxy source", async () => {
		const bytes = new TextEncoder().encode(
			"<html><head><title>Catalog Title</title></head><body><article><p>Fetched body.</p></article></body></html>",
		).buffer as ArrayBuffer;
		const input: RawInput = {
			kind: "bytes",
			bytes,
			fileName: "catalog.html",
			mimeType: "text/html",
		};
		const fetchUrl = vi.fn(async () => ({ input, finalUrl: "https://example.com/final" }));
		const deps = testDeps({ fetchUrl, catalogUrl: "https://catalog.test" });

		const res = await handleArticleImportRequest(
			jsonRequest({ url: "https://example.com/start" }),
			"user-1",
			deps,
		);

		expect(res.status).toBe(200);
		expect(fetchUrl).toHaveBeenCalledWith("https://example.com/start", {
			catalogUrl: "https://catalog.test",
		});
		expect(deps.insertBook).toHaveBeenCalledWith(
			expect.objectContaining({
				title: "Catalog Title",
				content: "Fetched body.",
				sourceUrl: "https://example.com/final",
			}),
		);
	});

	it("retries with a fresh id on book_id collision", async () => {
		const ids = ["aaaaaaaa", "bbbbbbbb"];
		const generateBookId = vi.fn(() => ids.shift() ?? "ffffffff");
		const insertBook = vi
			.fn<NonNullable<ArticleImportDeps["insertBook"]>>()
			.mockResolvedValueOnce(false)
			.mockResolvedValueOnce(true);

		const res = await handleArticleImportRequest(
			jsonRequest({
				html: "<html><body><article><p>Body.</p></article></body></html>",
				url: "https://example.com/read",
			}),
			"user-1",
			{ ...testDeps(), generateBookId, insertBook },
		);

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({ id: "bbbbbbbb" });
		expect(insertBook).toHaveBeenCalledTimes(2);
	});

	it("rejects http/https-only URLs in HTML payloads", async () => {
		const res = await handleArticleImportRequest(
			jsonRequest({ html: "<p>x</p>", url: "javascript:alert(1)" }),
			"user-1",
			testDeps(),
		);
		expect(res.status).toBe(400);
		await expect(res.json()).resolves.toEqual({ error: "Invalid URL" });
	});

	it("rate limits per user", async () => {
		const deps = testDeps({ checkLimit: () => ({ ok: false, retryAfter: 12 }) });
		const res = await handleArticleImportRequest(
			jsonRequest({ url: "https://example.com/start" }),
			"user-1",
			deps,
		);

		expect(res.status).toBe(429);
		expect(res.headers.get("Retry-After")).toBe("12");
		expect(deps.insertBook).not.toHaveBeenCalled();
	});
});

describe("handleArticleLookupRequest", () => {
	it("rejects missing url", async () => {
		const res = await handleArticleLookupRequest(
			new Request("https://lesefluss.test/api/import/article"),
			"u1",
		);
		expect(res.status).toBe(400);
	});

	it("rejects non-http lookup URLs", async () => {
		const lookupBookByUrl = vi.fn();
		const res = await handleArticleLookupRequest(
			new Request("https://lesefluss.test/api/import/article?url=javascript%3Aalert(1)"),
			"u1",
			{ lookupBookByUrl },
		);

		expect(res.status).toBe(400);
		await expect(res.json()).resolves.toEqual({ error: "Invalid URL" });
		expect(lookupBookByUrl).not.toHaveBeenCalled();
	});

	it("returns an existing URL import for the user", async () => {
		const lookupBookByUrl = vi.fn(async () => ({
			id: "book-1",
			title: "Saved Article",
			url: "https://example.com/read",
		}));
		const res = await handleArticleLookupRequest(
			new Request("https://lesefluss.test/api/import/article?url=https%3A%2F%2Fexample.com%2Fread"),
			"user-1",
			{ lookupBookByUrl },
		);

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({
			book: { id: "book-1", title: "Saved Article", url: "https://example.com/read" },
		});
		expect(lookupBookByUrl).toHaveBeenCalledWith("user-1", "https://example.com/read");
	});
});
