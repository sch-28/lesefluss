// @vitest-environment node
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);
const REPO = new URL("../../../../../", import.meta.url).pathname;
const ID = `gutenberg:test-proxy-${randomUUID()}`;
const EPUB_URL = "https://upstream.test/book.epub";
// The EPUB rate limiter keys on the client IP; without a socket in tests it needs this header.
const PROXY_HEADERS = { "x-forwarded-for": "203.0.113.7" };

const sized = (bytes: Uint8Array) => ({ "content-length": String(bytes.byteLength) });

let db: typeof import("../../db/index.js").db;
let booksRoute: typeof import("../books.js").booksRoute;
let epubBytes: Uint8Array;

async function wordCountRow() {
	const { rows } = await db.execute<{
		word_count: number | null;
		word_count_epub_url: string | null;
	}>(sql`SELECT word_count, word_count_epub_url FROM catalog_books WHERE id = ${ID}`);
	return rows[0];
}

describe.skipIf(!hasDb)("EPUB proxy word counting (integration)", () => {
	beforeAll(async () => {
		const [dbMod, { migrate }, schema, books] = await Promise.all([
			import("../../db/index.js"),
			import("../../db/migrate.js"),
			import("../../db/schema.js"),
			import("../books.js"),
		]);
		db = dbMod.db;
		booksRoute = books.booksRoute;
		await migrate();
		const { buildEpub } = (await import(
			`${REPO}packages/book-import/src/test-fixtures/build-epub.ts`
		)) as { buildEpub: (f: unknown) => Promise<ArrayBuffer> };
		epubBytes = new Uint8Array(
			await buildEpub({
				chapters: [{ id: "c1", href: "c1.xhtml", body: "<p>One two three four five.</p>" }],
			}),
		);
		await db.insert(schema.catalogBooks).values({
			id: ID,
			source: "gutenberg",
			title: "Proxy count",
			language: "qac",
			epubUrl: EPUB_URL,
		});
	});

	afterAll(async () => {
		vi.restoreAllMocks();
		if (db) await db.execute(sql`DELETE FROM catalog_books WHERE id = ${ID}`);
	});

	it("streams the upstream bytes unchanged and counts words in the background", async () => {
		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockImplementation(
				async () => new Response(epubBytes.slice(), { status: 200, headers: sized(epubBytes) }),
			);

		const res = await booksRoute.request(`/epub/${encodeURIComponent(ID)}`, {
			headers: PROXY_HEADERS,
		});
		expect(res.status).toBe(200);
		expect(new Uint8Array(await res.arrayBuffer())).toEqual(epubBytes);
		expect(fetchSpy).toHaveBeenCalledWith(EPUB_URL, expect.anything());

		await expect.poll(async () => (await wordCountRow())?.word_count, { timeout: 5_000 }).toBe(5);
		expect((await wordCountRow())?.word_count_epub_url).toBe(EPUB_URL);
	});

	it("does not recount a book whose EPUB is already counted", async () => {
		await db.execute(sql`UPDATE catalog_books SET word_count = 999 WHERE id = ${ID}`);
		vi.spyOn(globalThis, "fetch").mockImplementation(
			async () => new Response(epubBytes.slice(), { status: 200, headers: sized(epubBytes) }),
		);
		const res = await booksRoute.request(`/epub/${encodeURIComponent(ID)}`, {
			headers: PROXY_HEADERS,
		});
		expect(new Uint8Array(await res.arrayBuffer())).toEqual(epubBytes);
		await new Promise((r) => setTimeout(r, 200));
		expect((await wordCountRow())?.word_count).toBe(999);
	});

	it("does not tee a body of unknown size", async () => {
		await db.execute(sql`UPDATE catalog_books SET word_count = NULL WHERE id = ${ID}`);
		vi.spyOn(globalThis, "fetch").mockImplementation(
			async () => new Response(epubBytes.slice(), { status: 200 }),
		);
		const res = await booksRoute.request(`/epub/${encodeURIComponent(ID)}`, {
			headers: PROXY_HEADERS,
		});
		expect(new Uint8Array(await res.arrayBuffer())).toEqual(epubBytes);
		await new Promise((r) => setTimeout(r, 200));
		expect((await wordCountRow())?.word_count).toBeNull();
	});

	it("still serves the book when counting fails", async () => {
		await db.execute(sql`UPDATE catalog_books SET word_count = NULL WHERE id = ${ID}`);
		const notAnEpub = new TextEncoder().encode("plain bytes");
		vi.spyOn(globalThis, "fetch").mockImplementation(
			async () => new Response(notAnEpub.slice(), { status: 200, headers: sized(notAnEpub) }),
		);
		const res = await booksRoute.request(`/epub/${encodeURIComponent(ID)}`, {
			headers: PROXY_HEADERS,
		});
		expect(new Uint8Array(await res.arrayBuffer())).toEqual(notAnEpub);
		await new Promise((r) => setTimeout(r, 200));
		expect((await wordCountRow())?.word_count).toBeNull();
	});
});
