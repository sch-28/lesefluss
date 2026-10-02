import { type SQL, sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import { type BookRow, escapeLike, mapBookRow } from "../lib/book-row.js";
import { displayAuthor } from "../lib/display.js";
import { genrePatternsSql } from "../lib/genres.js";
import { langFilter } from "../lib/language.js";
import { parseSearchParams, type SearchParams } from "../lib/search-params.js";
import { textArray } from "../lib/sql-array.js";
import { type TagCount, tagCounts } from "../lib/tag-counts.js";

/** Exact word count, else the estimate; backed by the catalog_books_effective_words index. */
const EFFECTIVE_WORDS = sql`COALESCE(word_count, word_count_estimate)`;

const FACET_LIMIT = 12;

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

function buildPredicate(p: SearchParams, tsQuery: string): SQL {
	const likePattern = `%${escapeLike(p.q)}%`;
	const conditions: SQL[] = [sql`suppressed = false`, langFilter(p.lang)];

	if (p.q) {
		conditions.push(sql`(
			(${tsQuery} <> '' AND search_vec @@ to_tsquery('simple', ${tsQuery}))
			OR title ILIKE ${likePattern}
			OR author ILIKE ${likePattern}
			OR title % ${p.q}
			OR author % ${p.q}
		)`);
	}
	if (p.genre) {
		conditions.push(sql`EXISTS (
			SELECT 1 FROM unnest(subjects) s
			WHERE s ILIKE ANY(${genrePatternsSql(p.genre)})
		)`);
	}
	if (p.tags.length > 0) conditions.push(sql`tags @> ${textArray(p.tags)}`);
	if (p.authorKeys.length > 0) conditions.push(sql`author_keys && ${textArray(p.authorKeys)}`);
	if (p.source !== "any") conditions.push(sql`source = ${p.source}`);
	// A book with neither count nor estimate has no length, so a length filter leaves it out rather than reading null as 0.
	if (p.minWords !== null) conditions.push(sql`${EFFECTIVE_WORDS} >= ${p.minWords}`);
	if (p.maxWords !== null) conditions.push(sql`${EFFECTIVE_WORDS} <= ${p.maxWords}`);

	return sql.join(conditions, sql` AND `);
}

function orderBy(p: SearchParams): SQL {
	switch (p.sort) {
		case "relevance":
			// Without a query every rank is 0, so relevance degrades to popular.
			return p.q
				? sql`rank DESC, download_count DESC NULLS LAST`
				: sql`download_count DESC NULLS LAST, title ASC`;
		case "popular":
			return sql`download_count DESC NULLS LAST, title ASC`;
		case "title":
			return sql`lower(title) ASC, id ASC`;
		case "author":
			return sql`lower(author) ASC NULLS LAST, lower(title) ASC, id ASC`;
		case "recent":
			return sql`added_at DESC, id ASC`;
		case "length":
			return sql`${EFFECTIVE_WORDS} ASC NULLS LAST, id ASC`;
	}
}

const MIN_QUERY_FOR_EXTRAS = 2;

async function knownTags(tags: string[]): Promise<string[]> {
	if (tags.length === 0) return [];
	const { rows } = await db.execute<{ id: string }>(
		sql`SELECT id FROM catalog_tags WHERE id = ANY(${textArray(tags)})`,
	);
	const known = new Set(rows.map((r) => r.id));
	return tags.filter((t) => known.has(t));
}

/**
 * Facets scan every matching row, so they are only worth it on a set something
 * other than language or source has narrowed; for those, `/tags` has the
 * cached answer. A one-letter query narrows almost nothing.
 */
function isNarrowed(p: SearchParams): boolean {
	return Boolean(
		p.q.length >= MIN_QUERY_FOR_EXTRAS || p.genre || p.tags.length > 0 || p.authorKeys.length > 0,
	);
}

function appliesAnyFilter(p: SearchParams): boolean {
	return Boolean(
		p.q ||
			p.genre ||
			p.tags.length > 0 ||
			p.authorKeys.length > 0 ||
			p.source !== "any" ||
			p.minWords !== null ||
			p.maxWords !== null,
	);
}

const SUGGESTION_MIN_SIMILARITY = 0.2;

/** The query alone in the language, as if no other filter were set. */
function queryOnly(p: SearchParams): SearchParams {
	return {
		...p,
		genre: undefined,
		tags: [],
		author: null,
		authorKeys: [],
		source: "any",
		minWords: null,
		maxWords: null,
	};
}

/**
 * Closest title or author to a query that matched nothing, for a "did you
 * mean". Only when the query matches nothing even without the other filters:
 * if the filters are what hide its matches, "search without filters" is the
 * right next step, not a different spelling. Lowers the trigram threshold for
 * this transaction only, so the `%` operator stays index-backed.
 */
async function spellingSuggestion(p: SearchParams): Promise<string | null> {
	const bare = queryOnly(p);
	const hasOtherFilters =
		!!p.genre ||
		p.tags.length > 0 ||
		p.authorKeys.length > 0 ||
		p.source !== "any" ||
		p.minWords !== null ||
		p.maxWords !== null;
	if (hasOtherFilters) {
		const { rows } = await db.execute<{ hit: boolean }>(sql`
			SELECT EXISTS (
				SELECT 1 FROM catalog_books WHERE ${buildPredicate(bare, toPrefixTsQuery(p.q))}
			) AS hit
		`);
		if (rows[0]?.hit) return null;
	}
	const scope = buildPredicate({ ...bare, q: "" }, "");
	return db.transaction(async (tx) => {
		await tx.execute(
			sql`SELECT set_config('pg_trgm.similarity_threshold', ${String(SUGGESTION_MIN_SIMILARITY)}, true)`,
		);
		const { rows } = await tx.execute<{
			suggestion: string;
			source: string;
			is_author: boolean;
		}>(sql`
			SELECT suggestion, source, is_author FROM (
				SELECT title AS suggestion, source, false AS is_author, similarity(title, ${p.q}) AS score
				FROM catalog_books
				WHERE title % ${p.q} AND ${scope}
				UNION ALL
				SELECT author, source, true, similarity(author, ${p.q})
				FROM catalog_books
				WHERE author % ${p.q} AND ${scope}
			) candidates
			ORDER BY score DESC
			LIMIT 1
		`);
		const best = rows[0];
		if (!best) return null;
		return best.is_author ? displayAuthor(best.suggestion, best.source) : best.suggestion;
	});
}

export const searchRoute = new Hono().get("/", async (c) => {
	const parsed = parseSearchParams(
		(name) => c.req.query(name),
		(name) => c.req.queries(name),
	);
	if (!parsed.ok) return c.json({ error: parsed.error }, 400);
	// Unknown tags are dropped like unknown genres; the echo tells the client which ones applied.
	const p = { ...parsed.params, tags: await knownTags(parsed.params.tags) };
	const requestedFilters = parsed.params.tags.length > 0 || c.req.query("genre") !== undefined;

	const offset = (p.page - 1) * p.limit;
	const tsQuery = p.q ? toPrefixTsQuery(p.q) : "";
	const predicate = buildPredicate(p, tsQuery);

	const rankColumn =
		p.sort === "relevance" && p.q
			? sql`, (CASE WHEN ${tsQuery} <> ''
					THEN ts_rank(search_vec, to_tsquery('simple', ${tsQuery}))
					ELSE 0 END
					+ COALESCE(similarity(title, ${p.q}), 0)
					+ COALESCE(similarity(author, ${p.q}), 0) * 0.5
					+ CASE WHEN title ILIKE ${`${escapeLike(p.q)}%`} THEN 0.5 ELSE 0 END
				) AS rank`
			: sql``;

	// Filters that were all dropped as stale leave nothing the caller asked for.
	if (requestedFilters && !appliesAnyFilter(p)) {
		return c.json(searchResponse(p, 0, [], null, null));
	}

	const [result, countResult, facets] = await Promise.all([
		db.execute<BookRow>(sql`
			SELECT id, source, title, author, language, subjects, summary, cover_url, epub_url IS NOT NULL AS has_epub, word_count, word_count_estimate
				${rankColumn}
			FROM catalog_books
			WHERE ${predicate}
			ORDER BY ${orderBy(p)}
			LIMIT ${p.limit} OFFSET ${offset}
		`),
		db.execute<{ total: number }>(sql`
			SELECT count(*)::int AS total FROM catalog_books WHERE ${predicate}
		`),
		p.withTagFacets && isNarrowed(p)
			? tagCounts(sql`${predicate} AND tag <> ALL(${textArray(p.tags)})`, FACET_LIMIT)
			: Promise.resolve(null),
	]);

	const total = countResult.rows[0]?.total ?? 0;
	const suggestion =
		total === 0 && p.q.length >= MIN_QUERY_FOR_EXTRAS ? await spellingSuggestion(p) : null;

	return c.json(searchResponse(p, total, result.rows.map(mapBookRow), suggestion, facets));
});

function searchResponse(
	p: SearchParams,
	total: number,
	results: ReturnType<typeof mapBookRow>[],
	suggestion: string | null,
	facets: TagCount[] | null,
) {
	return {
		q: p.q,
		lang: p.lang,
		genre: p.genre?.id ?? null,
		tags: p.tags,
		author: p.author,
		source: p.source,
		minWords: p.minWords,
		maxWords: p.maxWords,
		sort: p.sort,
		// Shipped app versions read `order`; keep echoing it.
		order: p.sort,
		page: p.page,
		limit: p.limit,
		total,
		results,
		suggestion,
		...(facets ? { facets: { tags: facets } } : {}),
	};
}
