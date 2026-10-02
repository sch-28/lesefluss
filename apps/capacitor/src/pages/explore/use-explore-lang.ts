import { useQuery } from "@tanstack/react-query";
import { getLanguages } from "../../services/catalog/client";
import { catalogKeys } from "../../services/catalog/query-keys";

const LANG_STORAGE_KEY = "explore-lang";
const FALLBACK_LANG = "en";
const LANGUAGES_STALE_TIME_MS = 60 * 60 * 1000;

export function readStoredLang(): string | undefined {
	try {
		return localStorage.getItem(LANG_STORAGE_KEY) ?? undefined;
	} catch {
		return undefined;
	}
}

export function storeLang(lang: string): void {
	try {
		localStorage.setItem(LANG_STORAGE_KEY, lang);
	} catch {
		// Private mode or blocked storage: the choice still applies via the URL.
	}
}

/** Device locale's primary subtag when the catalog has books in it, else English. */
export function pickDefaultLang(
	deviceLanguage: string | undefined,
	available: readonly { code: string; count: number }[],
): string {
	const primary = deviceLanguage?.split("-")[0]?.toLowerCase();
	if (primary && available.some((l) => l.code === primary && l.count > 0)) return primary;
	return FALLBACK_LANG;
}

export function useCatalogLanguages(enabled = true) {
	return useQuery({
		queryKey: catalogKeys.languages,
		queryFn: ({ signal }) => getLanguages(signal),
		staleTime: LANGUAGES_STALE_TIME_MS,
		enabled,
		// A first-time visitor waits on this; offline should fall back to English fast.
		retry: false,
	});
}

/**
 * The language Explore browses in: URL, then the reader's last choice, then
 * the device locale. Undefined only while a first-time visitor's default is
 * still being checked against the catalog, so nothing fetches twice.
 */
export function useExploreLang(urlLang: string | undefined): string | undefined {
	const stored = readStoredLang();
	const devicePrimary = navigator.language?.split("-")[0]?.toLowerCase();
	const needsLookup = !urlLang && !stored && devicePrimary !== FALLBACK_LANG;
	const languages = useCatalogLanguages(needsLookup);

	if (urlLang) return urlLang;
	if (stored) return stored;
	if (!needsLookup) return FALLBACK_LANG;
	if (languages.data) return pickDefaultLang(navigator.language, languages.data.languages);
	return languages.isError ? FALLBACK_LANG : undefined;
}
