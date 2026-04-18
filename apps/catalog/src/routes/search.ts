import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import { type BookRow, escapeLike, mapBookRow } from "../lib/book-row.js";
import { findGenre, genreIlikePatterns } from "../lib/genres.js";
import { langFilter } from "../lib/language.js";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function parsePositiveInt(raw: string | undefined, fallback: number, max?: number): number {
	if (raw === undefined) return fallback;
	const n = Number(raw);
	if (!Number.isFinite(n) || n < 1) return fallback;
	const floored = Math.floor(n);
	return max ? Math.min(max, floored) : floored;
}

/**
 * Build a prefix tsquery string from user input. Each word becomes `word:*`
 * (prefix lexeme match) so "fran" matches "frankenstein" in the tsvector.
 * Non-alphanumeric characters are stripped to neutralise to_tsquery operator
 * syntax (&|!<>():* etc.) — without this, a raw query string could produce
 * a syntax error or unexpected boolean semantics.
 */
function toPrefixTsQuery(q: string): string {
	return q
		.split(/\s+/)
		.map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
		.filter(Boolean)
		.map((w) => `${w}:*`)
		.join(" & ");
}

export const searchRoute = new Hono().get("/", async (c) => {
	const q = c.req.query("q")?.trim() ?? "";
	const genreId = c.req.query("genre")?.trim();
	const genre = genreId ? findGenre(genreId) : undefined;
	if (genreId && !genre) return c.json({ error: `unknown genre: ${genreId}` }, 400);

	// q is required UNLESS a genre is provided (then we browse that genre)
	if (!q && !genre) return c.json({ error: "missing q or genre" }, 400);

	const lang = c.req.query("lang") ?? "en";
	const order = c.req.query("order") === "popular" ? "popular" : "relevance";
	const page = parsePositiveInt(c.req.query("page"), 1);
	const limit = parsePositiveInt(c.req.query("limit"), DEFAULT_LIMIT, MAX_LIMIT);
	const offset = (page - 1) * limit;

	const tsQuery = q ? toPrefixTsQuery(q) : "";
	const likePattern = q ? `%${escapeLike(q)}%` : "";

	const lf = langFilter(lang);

	// Text-match predicate (only applied when q is present)
	const textMatch = q
		? sql`(
				(${tsQuery} <> '' AND search_vec @@ to_tsquery('simple', ${tsQuery}))
				OR title ILIKE ${likePattern}
				OR author ILIKE ${likePattern}
				OR title % ${q}
				OR author % ${q}
			)`
		: sql`TRUE`;

	// Genre predicate — any subject matches any of the genre's ILIKE patterns
	const genreMatch = genre
		? sql`EXISTS (
				SELECT 1 FROM unnest(subjects) s
				WHERE s ILIKE ANY(${genreIlikePatterns(genre)})
			)`
		: sql`TRUE`;

	const predicate = sql`
		suppressed = false
			AND ${lf}
			AND ${textMatch}
			AND ${genreMatch}
	`;

	// Popular ordering doesn't need a computed rank — sort directly by download_count.
	// Relevance uses tsvector + trigram + prefix bonus, computed once and reused
	// in ORDER BY via the `rank` alias.
	const selectExtra =
		order === "popular"
			? sql``
			: sql`, (CASE WHEN ${tsQuery} <> ''
					THEN ts_rank(search_vec, to_tsquery('simple', ${tsQuery}))
					ELSE 0 END
					+ COALESCE(similarity(title, ${q}), 0)
					+ COALESCE(similarity(author, ${q}), 0) * 0.5
					+ CASE WHEN title ILIKE ${`${q}%`} THEN 0.5 ELSE 0 END
				) AS rank`;

	const orderBy =
		order === "popular"
			? sql`download_count DESC NULLS LAST, title ASC`
			: sql`rank DESC, download_count DESC NULLS LAST`;

	const [result, countResult] = await Promise.all([
		db.execute<BookRow>(sql`
			SELECT id, source, title, author, language, subjects, summary, cover_url
				${selectExtra}
			FROM catalog_books
			WHERE ${predicate}
			ORDER BY ${orderBy}
			LIMIT ${limit} OFFSET ${offset}
		`),
		db.execute<{ total: number }>(sql`
			SELECT count(*)::int AS total FROM catalog_books WHERE ${predicate}
		`),
	]);

	return c.json({
		q,
		lang,
		genre: genre?.id ?? null,
		order,
		page,
		limit,
		total: countResult.rows[0]?.total ?? 0,
		results: result.rows.map(mapBookRow),
	});
});
