import { type SQL, sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import { type Book, type BookRow, mapBookRow } from "../lib/book-row.js";
import { CLASSIC_IDS } from "../lib/classics.js";
import { GENRES, type Genre, genrePatternsSql } from "../lib/genres.js";
import { langFilter, parseLang } from "../lib/language.js";

const SHELF_SIZE = 12;
const GENRE_SHELF_SIZE = 8;
const ROTATING_GENRES = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

const COLUMNS = sql`id, source, title, author, language, subjects, summary, cover_url,
	epub_url IS NOT NULL AS has_epub, word_count, word_count_estimate`;

/** A few genres per day instead of all of them; the set rotates daily. */
export function genresForDay(day: number): Genre[] {
	const start = ((day % GENRES.length) + GENRES.length) % GENRES.length;
	return Array.from(
		{ length: ROTATING_GENRES },
		(_, i) => GENRES[(start + i) % GENRES.length] as Genre,
	);
}

async function shelf(query: SQL): Promise<Book[]> {
	const { rows } = await db.execute<BookRow>(query);
	return rows.map(mapBookRow);
}

export const landingRoute = new Hono().get("/", async (c) => {
	const lang = parseLang(c.req.query("lang"));
	if (!lang) return c.json({ error: "invalid lang" }, 400);
	const lf = langFilter(lang);
	const genres = genresForDay(Math.floor(Date.now() / DAY_MS));

	const named: Record<string, SQL> = {
		featured_se: sql`SELECT ${COLUMNS} FROM catalog_books
			WHERE source = 'standard_ebooks' AND suppressed = false AND ${lf}
			ORDER BY synced_at DESC LIMIT ${SHELF_SIZE}`,
		// unnest WITH ORDINALITY keeps the hand-picked order.
		classics: sql`SELECT b.id, b.source, b.title, b.author, b.language, b.subjects, b.summary,
				b.cover_url, b.epub_url IS NOT NULL AS has_epub, b.word_count, b.word_count_estimate
			FROM unnest(ARRAY[${sql.join(
				CLASSIC_IDS.map((id) => sql`${id}`),
				sql`, `,
			)}]::text[]) WITH ORDINALITY AS i(id, ord)
			JOIN catalog_books b ON b.id = i.id
			WHERE b.suppressed = false AND ${lf}
			ORDER BY i.ord`,
		most_read: sql`SELECT ${COLUMNS} FROM catalog_books
			WHERE suppressed = false AND ${lf} AND download_count IS NOT NULL
			ORDER BY download_count DESC NULLS LAST LIMIT ${SHELF_SIZE}`,
		recently_added: sql`SELECT ${COLUMNS} FROM catalog_books
			WHERE suppressed = false AND ${lf}
			ORDER BY added_at DESC, id LIMIT ${SHELF_SIZE}`,
	};
	const genreQueries = genres.map(
		(g) => sql`SELECT ${COLUMNS} FROM catalog_books
			WHERE suppressed = false AND ${lf}
				AND EXISTS (SELECT 1 FROM unnest(subjects) s WHERE s ILIKE ANY(${genrePatternsSql(g)}))
			ORDER BY (source = 'standard_ebooks') DESC, download_count DESC NULLS LAST
			LIMIT ${GENRE_SHELF_SIZE}`,
	);

	// One slow or failing shelf must not take the whole landing down.
	const entries = Object.entries(named);
	const keys = entries.map(([k]) => k);
	const settled = await Promise.allSettled([
		...entries.map(([, query]) => shelf(query)),
		...genreQueries.map(shelf),
	]);
	const failed: string[] = [];
	const value = (i: number, name: string): Book[] => {
		const r = settled[i];
		if (r?.status === "fulfilled") return r.value;
		failed.push(name);
		console.warn(`[landing] shelf ${name} failed:`, r?.reason);
		return [];
	};
	const shelves = Object.fromEntries(keys.map((k, i) => [k, value(i, k)]));

	return c.json({
		lang,
		...shelves,
		genres: genres.map((g, i) => ({
			id: g.id,
			label: g.label,
			books: value(keys.length + i, `genre:${g.id}`),
		})),
		failed,
	});
});
