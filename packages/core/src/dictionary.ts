/**
 * Response shape of the catalog's `GET /dictionary` endpoint.
 *
 * Mirrored by hand in `apps/catalog/src/lib/dict-row.ts`. The two cannot import
 * one another: the catalog Dockerfile does not vendor `packages/`, and that
 * service compiles with plain tsc rather than a bundler. Change both together.
 * The repo already keeps catalog book rows this way.
 */

export type DictionarySense = {
	partOfSpeech: string;
	gloss: string;
	example: string | null;
};

export type DictionaryEntry = {
	word: string;
	/** Which dictionary answered. May differ from the language that was asked for. */
	lang: string;
	senses: DictionarySense[];
};

export type DictionaryLookupResponse = {
	/** The normalized key the server actually looked up. */
	query: string;
	/** The requested language once normalized, or null when unusable. */
	requested: string | null;
	/** The language chain that was applied, in order. */
	chain: string[];
	/** Null when the word is in no configured dictionary. Not an error. */
	entry: DictionaryEntry | null;
	/** Set when the tapped word was an inflected form and `entry` is its lemma. */
	lemma: { from: string; note: string } | null;
	/** Wiktionary content is CC BY-SA; this must be shown wherever it is. */
	attribution: { source: string; license: string; url: string };
};
