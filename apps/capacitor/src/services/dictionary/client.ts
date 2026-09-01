import type { DictionaryLookupResponse } from "@lesefluss/core";
import { CATALOG_ENABLED, CATALOG_URL } from "../catalog/client";

export const DICTIONARY_ENABLED = CATALOG_ENABLED;

/**
 * Look a word up in the catalog's dictionary.
 *
 * `word` is sent with its original casing and no normalization: the server owns
 * the lookup-key rule, so there is one definition of it rather than two that can
 * drift, and casing still carries meaning for German homographs.
 *
 * `lang` is the book's own language, passed through unvalidated — the server
 * tolerates region tags, full language names and junk, and falls back to its
 * default chain when it cannot make sense of the value.
 */
export async function lookupWord(params: {
	word: string;
	lang?: string | null;
	signal?: AbortSignal;
}): Promise<DictionaryLookupResponse> {
	if (!CATALOG_URL) throw new Error("Catalog not configured (VITE_CATALOG_URL)");

	const url = new URL("/dictionary", CATALOG_URL);
	url.searchParams.set("w", params.word);
	if (params.lang) url.searchParams.set("lang", params.lang);

	const res = await fetch(url.toString(), { signal: params.signal });
	if (!res.ok) throw new Error(`Dictionary lookup failed (${res.status})`);
	return res.json();
}
