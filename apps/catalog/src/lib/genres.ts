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
 * Build ILIKE patterns (`%keyword%`) for a genre's subject patterns.
 * Used with `ANY(ARRAY[...])` against `unnest(subjects)`.
 */
export function genreIlikePatterns(genre: Genre): string[] {
	return genre.subjectPatterns.map((p) => `%${p}%`);
}
