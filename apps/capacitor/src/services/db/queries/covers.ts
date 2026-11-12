import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "../index";
import { bookContent, series } from "../schema";

export type StoredCover = { table: "book" | "series"; id: string };

/** Books and series whose stored cover is longer than `minChars`. */
export async function getOversizedCovers(minChars: number): Promise<StoredCover[]> {
	const bookRows = await db
		.select({ id: bookContent.bookId })
		.from(bookContent)
		.where(gt(sql`length(${bookContent.coverImage})`, minChars));
	const seriesRows = await db
		.select({ id: series.id })
		.from(series)
		.where(gt(sql`length(${series.coverImage})`, minChars));
	return [
		...bookRows.map(({ id }) => ({ table: "book" as const, id })),
		...seriesRows.map(({ id }) => ({ table: "series" as const, id })),
	];
}

export async function getStoredCover(cover: StoredCover): Promise<string | null> {
	if (cover.table === "book") {
		const rows = await db
			.select({ coverImage: bookContent.coverImage })
			.from(bookContent)
			.where(eq(bookContent.bookId, cover.id));
		return rows[0]?.coverImage ?? null;
	}
	const rows = await db
		.select({ coverImage: series.coverImage })
		.from(series)
		.where(eq(series.id, cover.id));
	return rows[0]?.coverImage ?? null;
}

/**
 * Writes only the cover column, and only while it still holds `from`: a cover
 * replaced or deleted since it was read stays as it now is. No sync stamp
 * moves. Series rows are still pushed whole, and the server takes an equal
 * stamp, so a shrunk series cover reaches the server on the next push.
 */
export async function replaceStoredCover(
	cover: StoredCover,
	from: string,
	to: string,
): Promise<void> {
	if (cover.table === "book") {
		await db
			.update(bookContent)
			.set({ coverImage: to })
			.where(and(eq(bookContent.bookId, cover.id), eq(bookContent.coverImage, from)));
		return;
	}
	await db
		.update(series)
		.set({ coverImage: to })
		.where(and(eq(series.id, cover.id), eq(series.coverImage, from)));
}
