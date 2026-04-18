import { desc, eq, ne } from "drizzle-orm";
import { db } from "../index";
import {
	type Book,
	type BookContent,
	bookContent,
	books,
	type Chapter,
	highlights,
	type NewBook,
} from "../schema";

/**
 * Fetch all books (metadata only) ordered by most recently read.
 * Since content now lives in a separate table, this is naturally lightweight.
 */
export async function getBooks(): Promise<Book[]> {
	return db.select().from(books).orderBy(desc(books.lastRead), desc(books.addedAt));
}

/**
 * Fetch cover images for all books. Returns a map of bookId → coverImage (base64 data URL).
 * Only fetches the cover_image column - avoids loading the full content text.
 */
export async function getBookCovers(): Promise<Map<string, string>> {
	const rows = await db
		.select({
			bookId: bookContent.bookId,
			coverImage: bookContent.coverImage,
		})
		.from(bookContent);

	const map = new Map<string, string>();
	for (const row of rows) {
		if (row.coverImage) {
			map.set(row.bookId, row.coverImage);
		}
	}
	return map;
}

/**
 * Fetch a single book's metadata by id.
 */
export async function getBook(id: string): Promise<Book | undefined> {
	const rows = await db.select().from(books).where(eq(books.id, id));
	return rows[0];
}

/**
 * Fetch a book previously imported from the catalog by its catalog id
 * (e.g. "gutenberg:1342", "se:mary-shelley/frankenstein").
 * Used for idempotent re-imports and for linking Explore → Library.
 */
export async function getBookByCatalogId(catalogId: string): Promise<Book | null> {
	const rows = await db.select().from(books).where(eq(books.catalogId, catalogId));
	return rows[0] ?? null;
}

/**
 * Fetch book content (plain text, cover, chapters) by book id.
 * Returns undefined if the book or its content doesn't exist.
 */
export async function getBookContent(id: string): Promise<BookContent | undefined> {
	const rows = await db.select().from(bookContent).where(eq(bookContent.bookId, id));
	return rows[0];
}

/**
 * Parse the chapters JSON column into typed Chapter[].
 * Returns empty array if null or invalid.
 */
export function parseChapters(raw: string | null): Chapter[] {
	if (!raw) return [];
	try {
		return JSON.parse(raw) as Chapter[];
	} catch {
		return [];
	}
}

/**
 * Insert a new book with its content. The id (8-char hex) is part of the book param.
 *
 * Inserts into `books` (metadata) then `book_content` (large data).
 */
export async function addBookWithContent(
	book: NewBook,
	content: string,
	coverImage?: string | null,
	chapters?: Chapter[] | null,
): Promise<string> {
	// Insert metadata
	await db.insert(books).values(book);

	// Insert content
	await db.insert(bookContent).values({
		bookId: book.id,
		content,
		coverImage: coverImage ?? null,
		chapters: chapters ? JSON.stringify(chapters) : null,
	});

	return book.id;
}

/**
 * Partial update any book metadata fields by id.
 * Accepts any subset of Book columns (except id).
 *
 * Examples:
 *   updateBook("a1b2c3d4", { filePath: "books/a1b2c3d4.epub" })
 *   updateBook("a1b2c3d4", { isActive: true })
 *   updateBook("a1b2c3d4", { position: 1234, lastRead: Date.now() })
 */
export async function updateBook(id: string, data: Partial<Omit<NewBook, "id">>): Promise<void> {
	await db.update(books).set(data).where(eq(books.id, id));
}

/**
 * Mark one book as active and clear isActive on every other book.
 * Also resets position to 0 for the newly activated book.
 *
 * Two targeted UPDATE statements - no full table scan, no race window from
 * a fetch-then-fan-out pattern.
 */
export async function setActiveBook(id: string): Promise<void> {
	// Deactivate all others in one statement
	await db.update(books).set({ isActive: false }).where(ne(books.id, id));
	// Activate the target - preserve its current position (may have been read in-app)
	await db.update(books).set({ isActive: true }).where(eq(books.id, id));
}

/**
 * Permanently delete a book from the database.
 * Deletes from both `book_content` and `books` tables.
 *
 * NOTE: This only handles DB cleanup. To also delete the file from disk,
 * use the `removeBook()` function from the bookImport service instead.
 */
export async function deleteBook(id: string): Promise<void> {
	// Delete highlights, content, then metadata (children before parent)
	await db.delete(highlights).where(eq(highlights.bookId, id));
	await db.delete(bookContent).where(eq(bookContent.bookId, id));
	await db.delete(books).where(eq(books.id, id));
}
