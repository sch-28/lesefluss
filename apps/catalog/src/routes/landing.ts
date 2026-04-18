import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import { type BookRow, mapBookRow } from "../lib/book-row.js";
import { CLASSIC_IDS } from "../lib/classics.js";
import { GENRES, genreIlikePatterns } from "../lib/genres.js";
import { langFilter } from "../lib/language.js";

const SHELF_SIZE = 12;
const GENRE_SHELF_SIZE = 8;

export const landingRoute = new Hono().get("/", async (c) => {
	const lang = c.req.query("lang") ?? "en";
	const lf = langFilter(lang);

	const [featured, classics, mostRead, ...genreResults] = await Promise.all([
		// Featured SE — most recently synced, non-suppressed
		db.execute<BookRow>(sql`
			SELECT id, source, title, author, language, subjects, summary, cover_url
			FROM catalog_books
			WHERE source = 'standard_ebooks' AND suppressed = false AND ${lf}
			ORDER BY synced_at DESC
			LIMIT ${SHELF_SIZE}
		`),
		// Classics — hand-picked, preserve CLASSIC_IDS order, filter by language
		db.execute<BookRow & { ord: number }>(sql`
			SELECT b.id, b.source, b.title, b.author, b.language, b.subjects, b.summary, b.cover_url,
				i.ord
			FROM unnest(${sql`${[...CLASSIC_IDS]}::text[]`}) WITH ORDINALITY AS i(id, ord)
			JOIN catalog_books b ON b.id = i.id
			WHERE b.suppressed = false AND ${lf}
			ORDER BY i.ord
		`),
		// Most read — non-suppressed, ordered by download_count
		db.execute<BookRow>(sql`
			SELECT id, source, title, author, language, subjects, summary, cover_url
			FROM catalog_books
			WHERE suppressed = false AND ${lf} AND download_count IS NOT NULL
			ORDER BY download_count DESC NULLS LAST
			LIMIT ${SHELF_SIZE}
		`),
		// Per-genre shelves — SE first, Gutenberg fills remaining slots
		...GENRES.map((g) =>
			db.execute<BookRow>(sql`
				SELECT id, source, title, author, language, subjects, summary, cover_url
				FROM catalog_books
				WHERE suppressed = false AND ${lf}
					AND EXISTS (
						SELECT 1 FROM unnest(subjects) s
						WHERE s ILIKE ANY(${genreIlikePatterns(g)})
					)
				ORDER BY (source = 'standard_ebooks') DESC, download_count DESC NULLS LAST
				LIMIT ${GENRE_SHELF_SIZE}
			`),
		),
	]);

	return c.json({
		lang,
		featured_se: featured.rows.map(mapBookRow),
		classics: classics.rows.map(mapBookRow),
		most_read: mostRead.rows.map(mapBookRow),
		genres: GENRES.map((g, i) => ({
			id: g.id,
			label: g.label,
			books: (genreResults[i]?.rows ?? []).map(mapBookRow),
		})),
	});
});
