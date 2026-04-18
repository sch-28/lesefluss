export const CATALOG_URL = (import.meta.env.VITE_CATALOG_URL ?? "").trim();

export const CATALOG_ENABLED = !!CATALOG_URL;

export type CatalogSource = "gutenberg" | "standard_ebooks";

export type CatalogSearchResult = {
	id: string;
	source: CatalogSource;
	title: string;
	author: string | null;
	language: string | null;
	subjects: string[] | null;
	summary: string | null;
	coverUrl: string | null;
};

export type CatalogSearchOrder = "relevance" | "popular";

export type CatalogSearchResponse = {
	q: string;
	lang: string;
	genre: string | null;
	order: CatalogSearchOrder;
	page: number;
	limit: number;
	total: number;
	results: CatalogSearchResult[];
};

export type CatalogLandingGenre = {
	id: string;
	label: string;
	books: CatalogSearchResult[];
};

export type CatalogLandingResponse = {
	lang: string;
	featured_se: CatalogSearchResult[];
	classics: CatalogSearchResult[];
	most_read: CatalogSearchResult[];
	genres: CatalogLandingGenre[];
};

export type CatalogRandomShelfResponse = {
	lang: string;
	source: "standard_ebooks" | "gutenberg" | "any";
	count: number;
	results: CatalogSearchResult[];
};

export type CatalogBook = {
	id: string;
	source: CatalogSource;
	title: string;
	author: string | null;
	language: string | null;
	subjects: string[] | null;
	summary: string | null;
	description: string | null;
	epubUrl: string | null;
	coverUrl: string | null;
};

function ensureEnabled(): string {
	if (!CATALOG_URL) throw new Error("Catalog not configured (VITE_CATALOG_URL)");
	return CATALOG_URL;
}

/**
 * Split `source:rest` for URL routes (the cover route uses "se" as the short form).
 */
function splitCatalogId(catalogId: string): { sourceSlug: string; rest: string } {
	const idx = catalogId.indexOf(":");
	if (idx <= 0) throw new Error(`Invalid catalog id: ${catalogId}`);
	const source = catalogId.slice(0, idx);
	const rest = catalogId.slice(idx + 1);
	const sourceSlug = source === "standard_ebooks" ? "se" : source;
	return { sourceSlug, rest };
}

export async function searchCatalog(params: {
	q: string;
	lang?: string;
	genre?: string;
	order?: CatalogSearchOrder;
	page?: number;
	limit?: number;
	signal?: AbortSignal;
}): Promise<CatalogSearchResponse> {
	const base = ensureEnabled();
	const url = new URL("/search", base);
	if (params.q) url.searchParams.set("q", params.q);
	if (params.lang) url.searchParams.set("lang", params.lang);
	if (params.genre) url.searchParams.set("genre", params.genre);
	if (params.order) url.searchParams.set("order", params.order);
	if (params.page) url.searchParams.set("page", String(params.page));
	if (params.limit) url.searchParams.set("limit", String(params.limit));

	const res = await fetch(url.toString(), { signal: params.signal });
	if (!res.ok) throw new Error(`Search failed (${res.status})`);
	return res.json();
}

export async function getLanding(
	lang: string,
	signal?: AbortSignal,
): Promise<CatalogLandingResponse> {
	const base = ensureEnabled();
	const url = new URL("/landing", base);
	url.searchParams.set("lang", lang);
	const res = await fetch(url.toString(), { signal });
	if (!res.ok) throw new Error(`Landing fetch failed (${res.status})`);
	return res.json();
}

export async function getRandomShelf(
	params: {
		count?: number;
		lang?: string;
		source?: "se" | "gutenberg" | "any";
	},
	signal?: AbortSignal,
): Promise<CatalogRandomShelfResponse> {
	const base = ensureEnabled();
	const url = new URL("/shelves/random", base);
	if (params.count) url.searchParams.set("count", String(params.count));
	if (params.lang) url.searchParams.set("lang", params.lang);
	if (params.source) url.searchParams.set("source", params.source);
	const res = await fetch(url.toString(), { signal });
	if (!res.ok) throw new Error(`Random shelf fetch failed (${res.status})`);
	return res.json();
}

export async function getCatalogBook(
	catalogId: string,
	signal?: AbortSignal,
): Promise<CatalogBook> {
	const base = ensureEnabled();
	const url = `${base}/books/${encodeURIComponent(catalogId)}`;
	const res = await fetch(url, { signal });
	if (res.status === 404) throw new Error("Book not found in catalog");
	if (!res.ok) throw new Error(`Catalog book fetch failed (${res.status})`);
	return res.json();
}

/**
 * Build a cover proxy URL from a catalog id.
 * Catalog IDs have the form `{source}:{rest}`; the cover route uses "se" in place of "standard_ebooks".
 * For SE, `rest` may contain slashes — encode each path segment separately.
 */
export function getCoverUrl(catalogId: string, fallback?: string | null): string | null {
	if (!CATALOG_URL) return fallback ?? null;
	try {
		const { sourceSlug, rest } = splitCatalogId(catalogId);
		const encodedRest = rest.split("/").map(encodeURIComponent).join("/");
		return `${CATALOG_URL}/covers/${sourceSlug}/${encodedRest}`;
	} catch {
		return fallback ?? null;
	}
}

/**
 * Build an external URL to the original source page for a catalog id.
 * Returns null for unknown sources.
 */
export function externalSourceUrl(catalogId: string): string | null {
	const idx = catalogId.indexOf(":");
	if (idx <= 0) return null;
	const source = catalogId.slice(0, idx);
	const rest = catalogId.slice(idx + 1);
	if (source === "gutenberg") return `https://www.gutenberg.org/ebooks/${rest}`;
	if (source === "se") return `https://standardebooks.org/ebooks/${rest}`;
	return null;
}

export async function downloadCatalogEpub(
	catalogId: string,
	onProgress?: (pct: number) => void,
	signal?: AbortSignal,
): Promise<Blob> {
	const base = ensureEnabled();
	const url = `${base}/books/epub/${encodeURIComponent(catalogId)}`;
	const res = await fetch(url, { signal });
	if (!res.ok) throw new Error(`EPUB download failed (${res.status})`);

	const total = Number(res.headers.get("content-length") ?? "0");
	if (!onProgress || !res.body || !total) return res.blob();

	const reader = res.body.getReader();
	const chunks: Uint8Array[] = [];
	let received = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		if (value) {
			chunks.push(value);
			received += value.length;
			onProgress(Math.min(100, Math.round((received / total) * 100)));
		}
	}
	return new Blob(chunks as BlobPart[], {
		type: res.headers.get("content-type") ?? "application/epub+zip",
	});
}
