import { displayAuthor } from "./display.js";
import { effectiveLength } from "./length-estimate.js";

/**
 * Shared row shape + mapper for catalog-book result rows.
 * All list endpoints (search, landing shelves, random shelf) project the same
 * columns and return the same client-facing JSON — keep that in one place.
 */
export type BookRow = {
	id: string;
	source: string;
	title: string;
	author: string | null;
	language: string | null;
	subjects: string[] | null;
	summary: string | null;
	cover_url: string | null;
	has_epub: boolean;
	word_count: number | null;
	word_count_estimate: number | null;
};

export type Book = {
	id: string;
	source: string;
	title: string;
	author: string | null;
	language: string | null;
	subjects: string[] | null;
	summary: string | null;
	coverUrl: string | null;
	hasEpub: boolean;
	/** The exact count, else the estimate; null when neither exists, never zero for "unknown". */
	wordCount: number | null;
	wordCountEstimated: boolean;
};

export function mapBookRow(r: BookRow): Book {
	return {
		id: r.id,
		source: r.source,
		title: r.title,
		author: displayAuthor(r.author, r.source),
		language: r.language,
		subjects: r.subjects,
		summary: r.summary,
		coverUrl: r.cover_url,
		hasEpub: r.has_epub,
		...effectiveLength(r.word_count, r.word_count_estimate),
	};
}

/**
 * Escape user input for a SQL `LIKE`/`ILIKE` pattern (backslash, %, _).
 * Pair with the driver's parameter binding — do not concatenate into SQL.
 */
export function escapeLike(q: string): string {
	return q.replace(/[\\%_]/g, (m) => `\\${m}`);
}
