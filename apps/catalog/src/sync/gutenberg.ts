import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { catalogBooks, type NewCatalogBook } from "../db/schema.js";
import { addBooksUpserted, setSyncPhase } from "./orchestrator.js";

const GUTENDEX_URL = "https://gutendex.com/books/";
const PAGE_CONCURRENCY = 2;
const PAGE_DELAY_MS = 1000;
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type GutendexAuthor = { name?: string; birth_year?: number | null; death_year?: number | null };
type GutendexBook = {
	id: number;
	title?: string;
	authors?: GutendexAuthor[];
	subjects?: string[];
	languages?: string[];
	summaries?: string[];
	formats?: Record<string, string>;
};
type GutendexPage = {
	count: number;
	next: string | null;
	previous: string | null;
	results: GutendexBook[];
};

function mapBook(b: GutendexBook): NewCatalogBook | null {
	const title = b.title?.trim();
	if (!title) return null;
	const formats = b.formats ?? {};
	const epubKey = Object.keys(formats).find((k) => k.startsWith("application/epub+zip"));
	const coverKey = Object.keys(formats).find((k) => k.startsWith("image/jpeg"));
	const author =
		b.authors && b.authors.length > 0
			? b.authors
					.map((a) => a.name?.trim())
					.filter((n): n is string => Boolean(n))
					.join(", ")
			: null;
	return {
		id: `gutenberg:${b.id}`,
		source: "gutenberg",
		title,
		author,
		language: b.languages?.[0] ?? null,
		subjects: b.subjects ?? null,
		summary: b.summaries?.[0] ?? null,
		description: null,
		epubUrl: epubKey ? (formats[epubKey] ?? null) : null,
		coverUrl: coverKey ? (formats[coverKey] ?? null) : null,
	};
}

/**
 * Batch upsert a page's worth of books in one INSERT...VALUES...ON CONFLICT.
 * Preserves `suppressed` (owned by SE dedup) by omitting it from the update set.
 */
async function upsertBatch(rows: NewCatalogBook[]) {
	if (rows.length === 0) return;
	await db
		.insert(catalogBooks)
		.values(rows)
		.onConflictDoUpdate({
			target: catalogBooks.id,
			set: {
				title: sql`excluded.title`,
				author: sql`excluded.author`,
				language: sql`excluded.language`,
				subjects: sql`excluded.subjects`,
				summary: sql`excluded.summary`,
				epubUrl: sql`excluded.epub_url`,
				coverUrl: sql`excluded.cover_url`,
				syncedAt: sql`now()`,
			},
		});
}

async function fetchPage(page: number): Promise<GutendexPage> {
	let lastErr: unknown;
	for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
		try {
			const res = await fetch(`${GUTENDEX_URL}?page=${page}`);
			const retriable = res.status === 429 || res.status >= 500;
			if (retriable) throw new Error(`HTTP ${res.status}`);
			if (!res.ok) throw new Error(`Gutendex page ${page} → HTTP ${res.status}`);
			return (await res.json()) as GutendexPage;
		} catch (err) {
			lastErr = err;
			if (attempt < MAX_RETRIES - 1) {
				await sleep(BASE_BACKOFF_MS * 2 ** attempt);
			}
		}
	}
	throw new Error(`Gutendex page ${page} failed after ${MAX_RETRIES} retries: ${lastErr}`);
}

async function processPage(page: number): Promise<number> {
	const data = await fetchPage(page);
	const rows = data.results.map(mapBook).filter((r): r is NewCatalogBook => r !== null);
	await upsertBatch(rows);
	return rows.length;
}

export async function syncGutenberg(): Promise<{ upserted: number }> {
	console.log("[gutenberg] starting sync");
	setSyncPhase("gutenberg", "fetching_page_1");
	const first = await fetchPage(1);
	const perPage = first.results.length || 32;
	const totalPages = Math.ceil(first.count / perPage);
	console.log(`[gutenberg] ${first.count} books across ${totalPages} pages`);

	const firstPageRows = first.results.map(mapBook).filter((r): r is NewCatalogBook => r !== null);
	await upsertBatch(firstPageRows);
	addBooksUpserted(firstPageRows.length);
	let upserted = firstPageRows.length;
	setSyncPhase("gutenberg", `fetching_page_1_of_${totalPages}`);

	const queue: number[] = [];
	for (let p = 2; p <= totalPages; p++) queue.push(p);

	let cursor = 0;
	async function worker() {
		while (cursor < queue.length) {
			const page = queue[cursor++];
			if (page === undefined) break;
			try {
				const n = await processPage(page);
				upserted += n;
				addBooksUpserted(n);
				setSyncPhase("gutenberg", `fetching_page_${page}_of_${totalPages}`);
				console.log(`[gutenberg] page ${page}/${totalPages} (+${n}, total ${upserted})`);
			} catch (err) {
				console.error(`[gutenberg] page ${page}/${totalPages} failed:`, err);
			}
			await sleep(PAGE_DELAY_MS);
		}
	}
	await Promise.all(Array.from({ length: PAGE_CONCURRENCY }, worker));

	console.log(`[gutenberg] done, upserted ${upserted}`);
	return { upserted };
}
