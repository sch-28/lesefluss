import { sql } from "drizzle-orm";
import { db } from "../db/index.js";

/**
 * Record a count for the EPUB at `epubUrl`. Guarded on the URL so a count of
 * an old edition never lands on a row whose EPUB changed meanwhile.
 */
export async function storeWordCount(id: string, epubUrl: string, count: number): Promise<void> {
	await db.execute(sql`
		UPDATE catalog_books
		SET word_count = ${count}, word_count_epub_url = ${epubUrl}, word_count_failed_at = NULL
		WHERE id = ${id} AND epub_url = ${epubUrl}
	`);
}

export async function markWordCountFailed(id: string): Promise<void> {
	await db.execute(sql`UPDATE catalog_books SET word_count_failed_at = now() WHERE id = ${id}`);
}
