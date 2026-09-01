import { DEFAULT_CHAIN, DICT_LANGUAGES } from "./languages.js";

/**
 * `books.language` is documented as BCP 47 but is filled by an unvalidated text
 * input, so it arrives as "en", "en-GB", "EN", "English", "Deutsch", or junk.
 * Everything here is best-effort: an unrecognised value costs the caller the
 * book-language-first hop, never an error.
 */
const ALIASES: Record<string, string> = {
	english: "en",
	englisch: "en",
	eng: "en",
	german: "de",
	deutsch: "de",
	ger: "de",
	deu: "de",
};

const MAX_CHAIN = 8;

export function normalizeLang(raw: string | null | undefined): string | null {
	if (!raw) return null;
	const value = raw.trim().toLowerCase();
	if (!value) return null;

	const aliased = ALIASES[value];
	if (aliased) return aliased;

	// "en-GB", "de_AT" -> primary subtag.
	const primary = value.split(/[-_\s]/)[0] ?? "";
	if (DICT_LANGUAGES.some((l) => l.code === primary)) return primary;

	return ALIASES[primary] ?? null;
}

/**
 * The book's own language first, then the configured fallback order.
 *
 * Order is correctness, not preference: English and German share homographs
 * where the wrong answer is silently plausible ("Gift" is poison in German, a
 * present in English).
 */
export function buildChain(requested: string | null): string[] {
	const chain = requested ? [requested, ...DEFAULT_CHAIN] : [...DEFAULT_CHAIN];
	return [...new Set(chain)].slice(0, MAX_CHAIN);
}
