import type { SQL } from "drizzle-orm";
import { textArray } from "./sql-array.js";

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
	{
		id: "romance",
		label: "Romance",
		subjectPatterns: ["love stories", "romance"],
	},
	{
		id: "adventure",
		label: "Adventure",
		subjectPatterns: ["adventure"],
	},
	{
		id: "horror",
		label: "Horror & Gothic",
		subjectPatterns: ["horror", "gothic", "ghost stories"],
	},
	{
		id: "fantasy",
		label: "Fantasy",
		subjectPatterns: ["fantasy", "fairy tales"],
	},
	{
		id: "short-stories",
		label: "Short Stories",
		subjectPatterns: ["short stories", "short fiction", "shorts"],
	},
	{
		id: "essays",
		label: "Essays",
		subjectPatterns: ["essays"],
	},
	{
		id: "biography",
		label: "Biography & Memoir",
		subjectPatterns: ["biography", "autobiograph", "memoir"],
	},
	{
		id: "humor",
		label: "Humor",
		subjectPatterns: ["humor", "humorous", "satire"],
	},
];

export function findGenre(id: string): Genre | undefined {
	return GENRES.find((g) => g.id === id);
}

export function genrePatternsSql(genre: Genre): SQL {
	return textArray(genre.subjectPatterns.map((p) => `%${p}%`));
}
