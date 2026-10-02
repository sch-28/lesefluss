import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "../index";
import { books } from "../schema";

/** catalogId → local book id for every catalog book in the library, in one query. */
export async function getLibraryCatalogIds(): Promise<Map<string, string>> {
	const rows = await db
		.select({ catalogId: books.catalogId, id: books.id })
		.from(books)
		.where(and(isNotNull(books.catalogId), eq(books.deleted, false)));
	const byCatalogId = new Map<string, string>();
	for (const r of rows) if (r.catalogId) byCatalogId.set(r.catalogId, r.id);
	return byCatalogId;
}
