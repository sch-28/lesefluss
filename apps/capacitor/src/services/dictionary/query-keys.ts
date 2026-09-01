/**
 * Centralised react-query keys for dictionary lookups.
 * Mirrors the hierarchy convention used by `catalogKeys` in catalog/query-keys.ts.
 */
export const dictionaryKeys = {
	/** All dictionary-scoped queries. */
	all: ["dictionary"] as const,

	/**
	 * One word in one book's language. The language belongs in the key: without
	 * it, opening the same word in a German book after an English one would be
	 * served the English definition from cache.
	 */
	lookup: (word: string, lang: string | null) =>
		["dictionary", "lookup", word, lang ?? ""] as const,
};
