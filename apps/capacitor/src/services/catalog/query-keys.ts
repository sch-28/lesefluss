import type { CatalogSort, CatalogSource } from "./client";

export type CatalogSearchPreviewParams = { q: string; lang: string; limit: number };

export type CatalogSearchFilters = {
	q: string;
	lang: string;
	genre?: string;
	tags: readonly string[];
	source?: CatalogSource;
	author?: string;
	sort: CatalogSort;
	minWords?: number;
	maxWords?: number;
};

/**
 * Centralised react-query keys for catalog-related queries.
 * Mirrors the hierarchy convention used by `bookKeys` in db/hooks/query-keys.ts.
 */
export const catalogKeys = {
	/** All catalog-scoped queries — invalidate to refresh everything. */
	all: ["catalog"] as const,

	/** Catalog results for one filter set; pages live inside the infinite query. */
	search: (filters: CatalogSearchFilters) => ["catalog", "search", filters] as const,

	/** A single short results page (grouped search), kept apart from the infinite query's keys. */
	searchPreview: (params: CatalogSearchPreviewParams) =>
		["catalog", "search-preview", params] as const,

	/** Languages with book counts. */
	languages: ["catalog", "languages"] as const,

	/** Tag listing for a language, narrowed by a name filter. */
	tags: (lang: string, q: string) => ["catalog", "tags", lang, q] as const,

	/** Genre ids, labels and counts for a language. */
	genres: (lang: string) => ["catalog", "genres", lang] as const,

	/** Landing page payload (featured + classics + most-read + per-genre shelves). */
	landing: (lang: string) => ["catalog", "landing", lang] as const,

	/**
	 * Random shelf. `nonce` lets the client's Shuffle button bypass react-query's
	 * cache by bumping the key (the server already reshuffles on every request).
	 */
	randomShelf: (lang: string, source: string, nonce: number) =>
		["catalog", "random-shelf", lang, source, nonce] as const,

	/** One author's books, any language, most popular first. */
	byAuthor: (author: string, limit: number) => ["catalog", "by-author", author, limit] as const,

	/** Books sharing tags with one book. */
	similar: (catalogId: string) => ["catalog", "similar", catalogId] as const,

	/** A single catalog book by id. */
	book: (catalogId: string) => ["catalog", "book", catalogId] as const,

	/** Local book row (or null) that was imported from the given catalog id. */
	localByCatalogId: (catalogId: string) => ["catalog", "local-by-catalog-id", catalogId] as const,
};

/** One catalog import per id, so every card and the detail page share its pending state. */
export const catalogImportMutationKey = (catalogId: string) =>
	["catalog-import", catalogId] as const;
