/**
 * Shared row shape + mapper for dictionary lookup rows.
 *
 * The client-facing types below are mirrored by hand in
 * `packages/core/src/dictionary.ts`, which the app imports. They cannot be
 * shared: the catalog Dockerfile does not vendor `packages/`, and this service
 * compiles with plain tsc rather than a bundler. Change both together.
 */
export type DictRow = {
	lang: string;
	word: string;
	pos: string;
	gloss: string;
	example: string | null;
	form_of: string | null;
};

export type DictionarySense = {
	partOfSpeech: string;
	gloss: string;
	example: string | null;
};

export type DictionaryEntry = {
	word: string;
	lang: string;
	senses: DictionarySense[];
};

export type DictionaryLookupResponse = {
	/** The normalized key actually looked up. */
	query: string;
	/** Language the request asked for first, once normalized. Null if unusable. */
	requested: string | null;
	/** The chain that was applied, in order. */
	chain: string[];
	entry: DictionaryEntry | null;
	/** Set when `query` was an inflected form and `entry` is its lemma. */
	lemma: { from: string; note: string } | null;
	attribution: { source: string; license: string; url: string };
};

export const DICT_ATTRIBUTION = {
	source: "Wiktionary",
	license: "CC BY-SA 4.0",
	url: "https://creativecommons.org/licenses/by-sa/4.0/",
} as const;

/** Rows arrive pre-sorted; the winning language is whichever answered first. */
export function mapDictEntry(rows: DictRow[]): DictionaryEntry | null {
	const winner = rows[0];
	if (!winner) return null;
	return {
		word: winner.word,
		lang: winner.lang,
		senses: rows
			.filter((r) => r.lang === winner.lang)
			.map((r) => ({ partOfSpeech: r.pos, gloss: r.gloss, example: r.example })),
	};
}
