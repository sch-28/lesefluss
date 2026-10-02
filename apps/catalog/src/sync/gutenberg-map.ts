import type { NewCatalogBook } from "../db/schema.js";
import { authorKeys } from "../lib/authors.js";
import { cleanTitle } from "../lib/display.js";
import { tagsFor } from "../lib/tags.js";
import type { MappedBook } from "./enrich.js";
import type { GutenbergRecord } from "./gutenberg-rdf.js";

/** The columns the Gutenberg sync owns: compared to detect a change, and the only ones it updates. */
export const SYNCED_COLUMNS = [
	"title",
	"author",
	"language",
	"subjects",
	"summary",
	"epubUrl",
	"coverUrl",
	"downloadCount",
	"tags",
	"bookshelves",
	"authorBirthYear",
	"authorDeathYear",
	"authorKeys",
] as const satisfies readonly (keyof NewCatalogBook)[];

export function syncedFields(r: Partial<NewCatalogBook>): string {
	return JSON.stringify(SYNCED_COLUMNS.map((c) => r[c] ?? null));
}

export function mapBook(b: GutenbergRecord): MappedBook | null {
	const title = b.title ? cleanTitle(b.title) : undefined;
	if (!title) return null;
	const names = b.authors.map((a) => a.name.trim()).filter(Boolean);
	const firstAuthor = b.authors[0];
	const keys = authorKeys(names);
	const { ids, tags } = tagsFor(b.subjects);
	const row: NewCatalogBook = {
		id: `gutenberg:${b.id}`,
		source: "gutenberg",
		title,
		author: names.length > 0 ? names.join(", ") : null,
		language: b.language ?? null,
		subjects: b.subjects.length > 0 ? b.subjects : null,
		summary: b.summary ?? null,
		description: null,
		epubUrl: b.epubUrl ?? null,
		coverUrl: b.coverUrl ?? null,
		downloadCount: b.downloadCount ?? null,
		tags: ids,
		bookshelves: b.bookshelves.length > 0 ? b.bookshelves : null,
		authorBirthYear: firstAuthor?.birthYear ?? null,
		authorDeathYear: firstAuthor?.deathYear ?? null,
		authorKeys: keys.length > 0 ? keys : null,
	};
	return { row, tags };
}
