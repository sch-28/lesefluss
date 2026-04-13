import { asc, eq } from "drizzle-orm";
import { db } from "../index";
import { type Highlight, highlights, type NewHighlight } from "../schema";

/**
 * Fetch all highlights for a book, ordered by position (start_offset ascending).
 */
export async function getHighlightsByBook(bookId: string): Promise<Highlight[]> {
	return db
		.select()
		.from(highlights)
		.where(eq(highlights.bookId, bookId))
		.orderBy(asc(highlights.startOffset));
}

/**
 * Insert a new highlight. Returns the generated id.
 */
export async function addHighlight(highlight: NewHighlight): Promise<string> {
	await db.insert(highlights).values(highlight);
	return highlight.id;
}

/**
 * Update color and/or note on an existing highlight.
 */
export async function updateHighlight(
	id: string,
	data: Partial<Pick<Highlight, "color" | "note" | "updatedAt">>,
): Promise<void> {
	await db.update(highlights).set(data).where(eq(highlights.id, id));
}

/**
 * Delete a single highlight by id.
 */
export async function deleteHighlight(id: string): Promise<void> {
	await db.delete(highlights).where(eq(highlights.id, id));
}

/**
 * Delete all highlights for a book. Called when the book itself is deleted.
 */
export async function deleteHighlightsByBook(bookId: string): Promise<void> {
	await db.delete(highlights).where(eq(highlights.bookId, bookId));
}
