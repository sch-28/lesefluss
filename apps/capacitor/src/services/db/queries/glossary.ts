import { asc, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "../index";
import { type GlossaryEntry, glossaryEntries, type NewGlossaryEntry } from "../schema";

/**
 * Fetch glossary entries for a book — includes both book-scoped (bookId = id)
 * and global (bookId IS NULL) entries. Ordered by label, case-insensitive.
 */
export async function getEntriesForBook(bookId: string): Promise<GlossaryEntry[]> {
	return db
		.select()
		.from(glossaryEntries)
		.where(or(eq(glossaryEntries.bookId, bookId), isNull(glossaryEntries.bookId)))
		.orderBy(asc(sql`lower(${glossaryEntries.label})`));
}

/**
 * Fetch all glossary entries across all books. Used by sync to push the full snapshot.
 */
export async function getAllEntries(): Promise<GlossaryEntry[]> {
	return db.select().from(glossaryEntries);
}

/**
 * Insert a new glossary entry. Returns the generated id (caller-provided on the entry).
 */
export async function addEntry(entry: NewGlossaryEntry): Promise<string> {
	await db.insert(glossaryEntries).values(entry);
	return entry.id;
}

/**
 * Partial update of an existing entry. `bookId` is updatable so users can flip
 * scope between book-scoped and global.
 */
export async function updateEntry(
	id: string,
	data: Partial<Pick<GlossaryEntry, "label" | "notes" | "color" | "bookId" | "updatedAt">>,
): Promise<void> {
	await db.update(glossaryEntries).set(data).where(eq(glossaryEntries.id, id));
}

/**
 * Delete a single entry by id.
 */
export async function deleteEntry(id: string): Promise<void> {
	await db.delete(glossaryEntries).where(eq(glossaryEntries.id, id));
}

/**
 * Cascade-delete all book-scoped entries for a book. Global entries (bookId IS NULL)
 * are intentionally untouched — they survive book deletion.
 */
export async function deleteEntriesByBook(bookId: string): Promise<void> {
	await db.delete(glossaryEntries).where(eq(glossaryEntries.bookId, bookId));
}
