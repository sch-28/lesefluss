import { type SQL, sql } from "drizzle-orm";

const LANG_PATTERN = /^(all|[a-z]{2,3})$/;

/**
 * Primary language subtag from a request, or null when malformed. Listing
 * caches are keyed on it, so it must come from a small, closed shape.
 */
export function parseLang(raw: string | undefined): string | null {
	const lang = (raw ?? "en").trim().toLowerCase();
	return LANG_PATTERN.test(lang) ? lang : null;
}

/**
 * BCP-47 prefix filter. `en` matches `en`, `en-GB`, `en-US`, etc.
 * Pass `"all"` to skip the filter entirely.
 */
export function langFilter(lang: string): SQL {
	if (lang === "all") return sql`TRUE`;
	return sql`(language = ${lang} OR language LIKE ${`${lang}-%`})`;
}
