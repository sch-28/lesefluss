import { type SQL, sql } from "drizzle-orm";

/**
 * BCP-47 prefix filter. `en` matches `en`, `en-GB`, `en-US`, etc.
 * Pass `"all"` to skip the filter entirely.
 */
export function langFilter(lang: string): SQL {
	if (lang === "all") return sql`TRUE`;
	return sql`(language = ${lang} OR language LIKE ${`${lang}-%`})`;
}
