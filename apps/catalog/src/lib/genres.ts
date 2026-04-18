import { type SQL, sql } from "drizzle-orm";

/**
 * Hand-curated genre buckets. Each `subjectPatterns` entry is a lowercase
 * substring matched against any element of `catalog_books.subjects[]` via
 * a case-insensitive LIKE. Gutenberg subjects are Library of Congress
 * classifications (e.g. "Science fiction", "Detective and mystery stories"),
 * so we match on the distinctive keyword rather than exact strings.
 */
export type Genre = {
	id: string;
	label: string;
	subjectPatterns: string[];
};

export const GENRES: readonly Genre[] = [
	{
		id: "fiction",
		label: "Fiction",
		subjectPatterns: ["fiction"],
	},
	{
		id: "science-fiction",
		label: "Science Fiction",
		subjectPatterns: ["science fiction"],
	},
	{
		id: "mystery",
		label: "Mystery",
		subjectPatterns: ["mystery", "detective"],
	},
	{
		id: "poetry",
		label: "Poetry",
		subjectPatterns: ["poetry"],
	},
	{
		id: "philosophy",
		label: "Philosophy",
		subjectPatterns: ["philosophy"],
	},
	{
		id: "children",
		label: "Children",
		subjectPatterns: ["children", "juvenile"],
	},
	{
		id: "history",
		label: "History",
		subjectPatterns: ["history"],
	},
	{
		id: "drama",
		label: "Drama",
		subjectPatterns: ["drama"],
	},
];

export function findGenre(id: string): Genre | undefined {
	return GENRES.find((g) => g.id === id);
}

/**
 * Build a SQL fragment expanding to `ARRAY[$a, $b, ...]` of ILIKE patterns
 * for a genre. Each pattern becomes its own bind parameter — passing the
 * whole array as a single parameter trips node-pg's text→text[] coercion
 * (`malformed array literal`).
 */
export function genrePatternsSql(genre: Genre): SQL {
	const fragments = genre.subjectPatterns.map((p) => sql`${`%${p}%`}`);
	return sql`ARRAY[${sql.join(fragments, sql`, `)}]::text[]`;
}
