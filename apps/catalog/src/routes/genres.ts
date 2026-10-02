import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import { GENRES, genrePatternsSql } from "../lib/genres.js";
import { langFilter, parseLang } from "../lib/language.js";
import { COUNTS_CACHE_TTL_MS, ttlCache } from "../lib/ttl-cache.js";

type GenreCount = { id: string; label: string; count: number };

const genreCountsCache = ttlCache<GenreCount[]>(COUNTS_CACHE_TTL_MS);

async function loadGenreCounts(lang: string): Promise<GenreCount[]> {
	// One scan with a FILTER per genre instead of a query per genre.
	const columns = GENRES.map(
		(g, i) => sql`count(*) FILTER (WHERE EXISTS (
			SELECT 1 FROM unnest(subjects) s WHERE s ILIKE ANY(${genrePatternsSql(g)})
		))::int AS ${sql.identifier(`g${i}`)}`,
	);
	const { rows } = await db.execute<Record<string, number>>(sql`
		SELECT ${sql.join(columns, sql`, `)}
		FROM catalog_books
		WHERE suppressed = false AND ${langFilter(lang)}
	`);
	const counts = rows[0] ?? {};
	return GENRES.map((g, i) => ({ id: g.id, label: g.label, count: counts[`g${i}`] ?? 0 }));
}

export const genresRoute = new Hono().get("/", async (c) => {
	const lang = parseLang(c.req.query("lang"));
	if (!lang) return c.json({ error: "invalid lang" }, 400);
	const genres = await genreCountsCache.get(lang, () => loadGenreCounts(lang));
	return c.json({ lang, genres });
});
