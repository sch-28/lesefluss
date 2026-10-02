import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import { COUNTS_CACHE_TTL_MS, ttlCache } from "../lib/ttl-cache.js";

type LanguageCount = { code: string; count: number };

const languageCountsCache = ttlCache<LanguageCount[]>(COUNTS_CACHE_TTL_MS);

function loadLanguageCounts(): Promise<LanguageCount[]> {
	// Grouped by primary subtag to match langFilter, where `en` covers `en-GB`.
	return db
		.execute<LanguageCount>(sql`
			SELECT lower(split_part(language, '-', 1)) AS code, count(*)::int AS count
			FROM catalog_books
			WHERE suppressed = false AND language IS NOT NULL AND language <> ''
			GROUP BY 1
			ORDER BY count DESC, code ASC
		`)
		.then((r) => r.rows);
}

export const languagesRoute = new Hono().get("/", async (c) => {
	const languages = await languageCountsCache.get("all", loadLanguageCounts);
	return c.json({
		total: languages.reduce((sum, l) => sum + l.count, 0),
		languages,
	});
});
