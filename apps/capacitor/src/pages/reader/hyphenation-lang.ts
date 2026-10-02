const FALLBACK_LANG = "en";
/** ISO 639 codes for undetermined, multiple, uncoded or no linguistic content. */
const NON_LANGUAGES = new Set(["und", "mul", "mis", "zxx"]);

/**
 * The book's `language` as an HTML `lang` value, which picks the browser's
 * hyphenation dictionary. The column is free text (EPUB `dc:language` verbatim,
 * user-editable), so anything that is not a plausible language tag falls back
 * to English rather than leaving the text unhyphenated.
 */
export function hyphenationLang(language: string | null | undefined): string {
	const tag = language?.trim().replace(/_/g, "-");
	if (!tag) return FALLBACK_LANG;
	try {
		const [canonical] = Intl.getCanonicalLocales(tag);
		// "English" is a well-formed 7-letter subtag, but no browser knows it.
		if (!canonical || !/^[a-z]{2,3}(-|$)/.test(canonical)) return FALLBACK_LANG;
		if (NON_LANGUAGES.has(canonical.split("-")[0])) return FALLBACK_LANG;
		return canonical;
	} catch {
		return FALLBACK_LANG;
	}
}
