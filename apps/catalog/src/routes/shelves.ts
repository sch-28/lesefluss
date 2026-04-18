import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import { type BookRow, mapBookRow } from "../lib/book-row.js";
import { langFilter } from "../lib/language.js";

const DEFAULT_COUNT = 8;
const MAX_COUNT = 20;

function parseCount(raw: string | undefined): number {
	if (raw === undefined) return DEFAULT_COUNT;
	const n = Number(raw);
	if (!Number.isFinite(n) || n < 1) return DEFAULT_COUNT;
	return Math.min(MAX_COUNT, Math.floor(n));
}

function parseSource(raw: string | undefined): "standard_ebooks" | "gutenberg" | "any" {
	// Spec: defaults to SE. The client passes "se" as shorthand; anything
	// unrecognised falls back to the default (no error — public endpoint).
	if (raw === "gutenberg") return "gutenberg";
	if (raw === "any" || raw === "all") return "any";
	return "standard_ebooks";
}

export const shelvesRoute = new Hono().get("/random", async (c) => {
	const count = parseCount(c.req.query("count"));
	const lang = c.req.query("lang") ?? "en";
	const source = parseSource(c.req.query("source"));
	const lf = langFilter(lang);

	const sourceFilter = source === "any" ? sql`TRUE` : sql`source = ${source}`;

	// Each call reshuffles — no server cache. ORDER BY random() with a small
	// LIMIT is fine on this table (<100k rows).
	const result = await db.execute<BookRow>(sql`
		SELECT id, source, title, author, language, subjects, summary, cover_url
		FROM catalog_books
		WHERE suppressed = false AND ${lf} AND ${sourceFilter}
		ORDER BY random()
		LIMIT ${count}
	`);

	return c.json({
		lang,
		source,
		count,
		results: result.rows.map(mapBookRow),
	});
});
