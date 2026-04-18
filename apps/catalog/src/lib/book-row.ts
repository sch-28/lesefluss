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
};

export function mapBookRow(r: BookRow): Book {
	return {
		id: r.id,
		source: r.source,
		title: r.title,
		author: r.author,
		language: r.language,
		subjects: r.subjects,
		summary: r.summary,
		coverUrl: r.cover_url,
	};
}

/**
 * Escape user input for a SQL `LIKE`/`ILIKE` pattern (backslash, %, _).
 * Pair with the driver's parameter binding — do not concatenate into SQL.
 */
export function escapeLike(q: string): string {
	return q.replace(/[\\%_]/g, (m) => `\\${m}`);
}
