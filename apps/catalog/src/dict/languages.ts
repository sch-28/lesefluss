/**
 * Dictionary editions we import. Adding a language is an entry here plus one
 * admin import call — no code change.
 *
 * Each edition is extracted from that language's own Wiktionary, so its glosses
 * are written in that language (the German edition defines German words in German).
 *
 * `url` is stored in full rather than built from a template: kaikki's paths are
 * not uniform. English lives under /dictionary/English/, every other edition
 * under /{code}wiktionary/{Endonym}/. Endonyms with non-ASCII characters
 * (Français) must be percent-encoded here.
 *
 * Gzipped dumps are ~6x smaller than the raw JSONL and decompress in-stream.
 */
export type DictLanguage = {
	/** Primary subtag stored in `catalog_dict_entry.lang`. */
	code: string;
	/** Endonym, for the languages listing. */
	label: string;
	url: string;
	/** Position in the default fallback chain, ascending. */
	chainOrder: number;
};

export const DICT_LANGUAGES: readonly DictLanguage[] = [
	{
		code: "en",
		label: "English",
		chainOrder: 0,
		url: "https://kaikki.org/dictionary/English/kaikki.org-dictionary-English.jsonl.gz",
	},
	{
		code: "de",
		label: "Deutsch",
		chainOrder: 1,
		url: "https://kaikki.org/dewiktionary/Deutsch/kaikki.org-dictionary-Deutsch.jsonl.gz",
	},
];

export const DEFAULT_CHAIN: readonly string[] = [...DICT_LANGUAGES]
	.sort((a, b) => a.chainOrder - b.chainOrder)
	.map((l) => l.code);

export function findLanguage(code: string): DictLanguage | undefined {
	return DICT_LANGUAGES.find((l) => l.code === code);
}
