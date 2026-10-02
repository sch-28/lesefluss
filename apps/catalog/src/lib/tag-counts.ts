import { type SQL, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { langFilter } from "./language.js";
import { COUNTS_CACHE_TTL_MS, ttlCache } from "./ttl-cache.js";

export type TagCount = { id: string; label: string; count: number };

/** Tags with book counts over the rows matching `predicate`, most common first. */
export async function tagCounts(predicate: SQL, limit?: number): Promise<TagCount[]> {
	const { rows } = await db.execute<TagCount>(sql`
		SELECT f.id, t.label, f.count FROM (
			SELECT tag AS id, count(*)::int AS count
			FROM catalog_books CROSS JOIN LATERAL unnest(tags) AS tag
			WHERE ${predicate}
			GROUP BY tag
			ORDER BY count DESC, tag ASC
			${limit === undefined ? sql`` : sql`LIMIT ${limit}`}
		) f
		JOIN catalog_tags t ON t.id = f.id
		ORDER BY f.count DESC, f.id ASC
	`);
	return rows;
}

const languageTagCounts = ttlCache<TagCount[]>(COUNTS_CACHE_TTL_MS);

/** Every tag's book count in a language (`all` for the whole catalog), cached. */
export function cachedTagCounts(lang: string): Promise<TagCount[]> {
	return languageTagCounts.get(lang, () =>
		tagCounts(sql`suppressed = false AND ${langFilter(lang)}`),
	);
}
