import { sql } from "drizzle-orm";
import { db } from "../db/index.js";

/**
 * Per-language entry counts, cached.
 *
 * The underlying `GROUP BY lang` scans millions of rows, and `/dictionary/languages`
 * is public. Without a cache each request would pay that scan, which is a cheap
 * way for one client to load the database. The numbers only move when an import
 * runs, so a stale minute costs nothing.
 */
const TTL_MS = 60_000;
let cache: { at: number; value: Record<string, number> } | null = null;

export async function getDictCounts(): Promise<Record<string, number>> {
	const now = Date.now();
	if (cache && now - cache.at < TTL_MS) return cache.value;

	const result = await db.execute<{ lang: string; n: number }>(
		sql`SELECT lang, count(*)::int AS n FROM catalog_dict_entry GROUP BY lang`,
	);

	const value: Record<string, number> = {};
	for (const row of result.rows) value[row.lang] = row.n;

	cache = { at: now, value };
	return value;
}

export function invalidateDictCounts() {
	cache = null;
}
