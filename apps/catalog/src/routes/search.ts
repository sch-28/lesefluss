import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

type Row = {
	id: string;
	source: string;
	title: string;
	author: string | null;
	language: string | null;
	subjects: string[] | null;
	summary: string | null;
	cover_url: string | null;
	rank: number;
};

function parsePositiveInt(raw: string | undefined, fallback: number, max?: number): number {
	if (raw === undefined) return fallback;
	const n = Number(raw);
	if (!Number.isFinite(n) || n < 1) return fallback;
	const floored = Math.floor(n);
	return max ? Math.min(max, floored) : floored;
}

export const searchRoute = new Hono().get("/", async (c) => {
	const q = c.req.query("q")?.trim();
	if (!q) return c.json({ error: "missing q" }, 400);

	const lang = c.req.query("lang") ?? "en";
	const page = parsePositiveInt(c.req.query("page"), 1);
	const limit = parsePositiveInt(c.req.query("limit"), DEFAULT_LIMIT, MAX_LIMIT);
	const offset = (page - 1) * limit;

	// Prefix match so `en` covers `en`, `en-GB`, `en-US`, etc. (BCP-47 region tags)
	const langFilter =
		lang === "all" ? sql`TRUE` : sql`(language = ${lang} OR language LIKE ${`${lang}-%`})`;
	const predicate = sql`
		suppressed = false
			AND ${langFilter}
			AND (
				search_vec @@ plainto_tsquery('simple', ${q})
				OR title % ${q}
				OR author % ${q}
			)
	`;

	const [result, countResult] = await Promise.all([
		db.execute<Row>(sql`
			SELECT id, source, title, author, language, subjects, summary, cover_url,
				(ts_rank(search_vec, plainto_tsquery('simple', ${q}))
					+ COALESCE(similarity(title, ${q}), 0)
					+ COALESCE(similarity(author, ${q}), 0) * 0.5) AS rank
			FROM catalog_books
			WHERE ${predicate}
			ORDER BY rank DESC
			LIMIT ${limit} OFFSET ${offset}
		`),
		db.execute<{ total: number }>(sql`
			SELECT count(*)::int AS total FROM catalog_books WHERE ${predicate}
		`),
	]);

	return c.json({
		q,
		lang,
		page,
		limit,
		total: countResult.rows[0]?.total ?? 0,
		results: result.rows.map((r) => ({
			id: r.id,
			source: r.source,
			title: r.title,
			author: r.author,
			language: r.language,
			subjects: r.subjects,
			summary: r.summary,
			coverUrl: r.cover_url,
		})),
	});
});
