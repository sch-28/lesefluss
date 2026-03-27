import { desc, eq } from "drizzle-orm";
import { db, rawQuery } from "../index";
import {
	bookContent,
	books,
	type Book,
	type BookContent,
	type Chapter,
	type NewBook,
} from "../schema";

/**
 * Fetch all books (metadata only) ordered by most recently read.
 * Since content now lives in a separate table, this is naturally lightweight.
 */
export async function getBooks(): Promise<Book[]> {
	return db
		.select()
		.from(books)
		.orderBy(desc(books.lastRead), desc(books.addedAt));
}

/**
 * Fetch cover images for all books. Returns a map of bookId → coverImage (base64 data URL).
 * Only fetches the cover_image column — avoids loading the full content text.
 */
export async function getBookCovers(): Promise<Map<number, string>> {
	const rows = await db
		.select({
			bookId: bookContent.bookId,
			coverImage: bookContent.coverImage,
		})
		.from(bookContent);

	const map = new Map<number, string>();
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
export async function getBook(id: number): Promise<Book | undefined> {
	const rows = await db.select().from(books).where(eq(books.id, id));
	return rows[0];
}

/**
 * Fetch book content (plain text, cover, chapters) by book id.
 * Returns undefined if the book or its content doesn't exist.
 */
export async function getBookContent(
	id: number,
): Promise<BookContent | undefined> {
	const rows = await db
		.select()
		.from(bookContent)
		.where(eq(bookContent.bookId, id));
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
 * Insert a new book with its content. Returns the new book's id.
 *
 * Inserts into `books` (metadata) then `book_content` (large data).
 * sqlite-proxy doesn't expose lastInsertRowid, so we query it separately.
 */
export async function addBookWithContent(
	book: Omit<NewBook, "id">,
	content: string,
	coverImage?: string | null,
	chapters?: Chapter[] | null,
): Promise<number> {
	// Insert metadata
	await db.insert(books).values(book);
	const rows = await rawQuery("SELECT last_insert_rowid() as id");
	const id: number = rows[0]?.id ?? 0;

	// Insert content
	await db.insert(bookContent).values({
		bookId: id,
		content,
		coverImage: coverImage ?? null,
		chapters: chapters ? JSON.stringify(chapters) : null,
	});

	return id;
}

/**
 * Partial update any book metadata fields by id.
 * Accepts any subset of Book columns (except id).
 *
 * Examples:
 *   updateBook(1, { filePath: "books/1.epub" })
 *   updateBook(1, { slot: 2 })
 *   updateBook(1, { position: 1234, lastRead: Date.now() })
 */
export async function updateBook(
	id: number,
	data: Partial<Omit<NewBook, "id">>,
): Promise<void> {
	await db.update(books).set(data).where(eq(books.id, id));
}

/**
 * Permanently delete a book from the database.
 * Deletes from both `book_content` and `books` tables.
 *
 * NOTE: This only handles DB cleanup. To also delete the file from disk,
 * use the `removeBook()` function from the bookImport service instead.
 */
export async function deleteBook(id: number): Promise<void> {
	// Delete content first (child), then metadata (parent)
	await db.delete(bookContent).where(eq(bookContent.bookId, id));
	await db.delete(books).where(eq(books.id, id));
}
