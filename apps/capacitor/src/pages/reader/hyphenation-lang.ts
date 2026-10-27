/** ISO 639 codes for undetermined, multiple, uncoded or no linguistic content. */
const NON_LANGUAGES = new Set(["und", "mul", "mis", "zxx"]);

/** Language names some EPUBs put in `dc:language` instead of a code. */
const LANGUAGE_NAMES: Record<string, string> = {
	english: "en",
	german: "de",
	deutsch: "de",
	french: "fr",
	français: "fr",
	francais: "fr",
	spanish: "es",
	español: "es",
	espanol: "es",
	italian: "it",
	italiano: "it",
	dutch: "nl",
	nederlands: "nl",
	portuguese: "pt",
	português: "pt",
	russian: "ru",
	polish: "pl",
	polski: "pl",
	swedish: "sv",
	svenska: "sv",
};

function languageTag(value: string | null | undefined): string | null {
	const tag = value?.trim().replace(/_/g, "-");
	if (!tag) return null;
	const named = LANGUAGE_NAMES[tag.toLowerCase()];
	if (named) return named;
	try {
		const [canonical] = Intl.getCanonicalLocales(tag);
		// "English" is a well-formed 7-letter subtag, but no browser knows it.
		if (!canonical || !/^[a-z]{2,3}(-|$)/.test(canonical)) return null;
		if (NON_LANGUAGES.has(canonical.split("-")[0])) return null;
		return canonical;
	} catch {
		return null;
	}
}

/**
 * The book's `language` as an HTML `lang` value, which picks the browser's
 * hyphenation dictionary. The column is free text (EPUB `dc:language` verbatim,
 * user-editable); anything that is not a language falls back to the device's.
 */
export function hyphenationLang(
	language: string | null | undefined,
	deviceLanguage: string | undefined = globalThis.navigator?.language,
): string {
	return languageTag(language) ?? languageTag(deviceLanguage) ?? "en";
}
