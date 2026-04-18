/**
 * Centralised react-query keys for catalog-related queries.
 * Mirrors the hierarchy convention used by `bookKeys` in db/hooks/query-keys.ts.
 */
export const catalogKeys = {
	/** All catalog-scoped queries — invalidate to refresh everything. */
	all: ["catalog"] as const,

	/** Paginated search results keyed by query + language + genre + order + page. */
	search: (
		q: string,
		lang: string,
		genre: string | null,
		order: "relevance" | "popular",
		page: number,
	) => ["catalog", "search", q, lang, genre, order, page] as const,

	/** Landing page payload (featured + classics + most-read + per-genre shelves). */
	landing: (lang: string) => ["catalog", "landing", lang] as const,

	/**
	 * Random shelf. `nonce` lets the client's Shuffle button bypass react-query's
	 * cache by bumping the key (the server already reshuffles on every request).
	 */
	randomShelf: (lang: string, source: string, nonce: number) =>
		["catalog", "random-shelf", lang, source, nonce] as const,

	/** A single catalog book by id. */
	book: (catalogId: string) => ["catalog", "book", catalogId] as const,

	/** Local book row (or null) that was imported from the given catalog id. */
	localByCatalogId: (catalogId: string) => ["catalog", "local-by-catalog-id", catalogId] as const,
};
