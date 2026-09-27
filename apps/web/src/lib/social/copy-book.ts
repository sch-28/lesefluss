import { generateBookId } from "@lesefluss/book-import";
import { and, eq, isNotNull, isNull, type SQL, sql } from "drizzle-orm";
import type { Tx } from "~/db";
import { type COPY_SOURCES, syncBookCopy, syncBooks } from "~/db/schema";
import { isUniqueViolation } from "~/lib/db-errors";
import type { BookOrigin } from "~/lib/origin";
import { SocialError } from "./errors";

export type CopyInput = {
	sourceUserId: string;
	sourceBookId: string;
	recipientId: string;
	via: (typeof COPY_SOURCES)[number];
	now?: Date;
};

export type CopyResult = { bookId: string; created: boolean };

/** What makes a row copyable: live, standalone, with content. */
export function isShareableRow(): SQL {
	return and(
		eq(syncBooks.deleted, false),
		isNotNull(syncBooks.content),
		isNull(syncBooks.seriesId),
	) as SQL;
}

/** The copyable row `(userId, bookId)`, or null. */
export async function shareableSource(
	exec: Tx,
	userId: string,
	bookId: string,
): Promise<
	(BookOrigin & { title: string; author: string | null; wordCount: number | null }) | null
> {
	const [row] = await exec
		.select({
			originUserId: syncBooks.originUserId,
			originBookId: syncBooks.originBookId,
			title: syncBooks.title,
			author: syncBooks.author,
			wordCount: syncBooks.wordCount,
		})
		.from(syncBooks)
		.where(and(eq(syncBooks.userId, userId), eq(syncBooks.bookId, bookId), isShareableRow()));
	return row ?? null;
}

async function liveCopyOf(tx: Tx, userId: string, origin: BookOrigin): Promise<string | null> {
	const [row] = await tx
		.select({ bookId: syncBooks.bookId })
		.from(syncBooks)
		.where(
			and(
				eq(syncBooks.userId, userId),
				eq(syncBooks.originUserId, origin.originUserId),
				eq(syncBooks.originBookId, origin.originBookId),
				eq(syncBooks.deleted, false),
			),
		);
	return row?.bookId ?? null;
}

/**
 * Gives `recipientId` the source book as their own row, or links them to the
 * copy they already hold of the same origin. Content never leaves Postgres:
 * the row is written with INSERT ... SELECT. The copy record is what lets a
 * push after Clear cloud data keep the origin. Shared by shares and buddy reads.
 */
export async function copyBookForUser(tx: Tx, input: CopyInput): Promise<CopyResult> {
	const now = input.now ?? new Date();
	const source = await shareableSource(tx, input.sourceUserId, input.sourceBookId);
	if (!source) throw new SocialError("unavailable");
	const existing = await liveCopyOf(tx, input.recipientId, source);
	if (existing) return { bookId: existing, created: false };

	const stamp = now.toISOString();
	for (let attempt = 0; attempt < 2; attempt++) {
		const bookId = generateBookId();
		let rowCount = 0;
		try {
			// A savepoint: a unique violation must not abort the caller's transaction.
			rowCount = await tx.transaction(async (sp) => {
				const result = await sp.execute(sql`
				INSERT INTO ${syncBooks} (
					user_id, book_id, origin_user_id, origin_book_id, title, author, file_size, word_count,
					word_position, content, cover_image, chapters, link_ranges, source, catalog_id,
					description, language, deleted, chapter_status, added_at, updated_at, metadata_updated_at
				)
				SELECT ${input.recipientId}, ${bookId}, origin_user_id, origin_book_id, title, author, file_size, word_count,
					0, content, cover_image, chapters, link_ranges, source, catalog_id,
					description, language, false, 'fetched', ${stamp}::timestamp, ${stamp}::timestamp, ${stamp}::timestamp
				FROM ${syncBooks}
				WHERE user_id = ${input.sourceUserId} AND book_id = ${input.sourceBookId}
				  AND NOT deleted AND content IS NOT NULL AND series_id IS NULL
				ON CONFLICT (user_id, book_id) DO NOTHING
			`);
				return result.rowCount ?? 0;
			});
		} catch (err) {
			// The live-origin index fired: a racing copy landed first, so link to it.
			if (isUniqueViolation(err)) {
				const raced = await liveCopyOf(tx, input.recipientId, source);
				if (raced) return { bookId: raced, created: false };
			}
			throw err;
		}
		if (rowCount === 0) {
			// Either the 8-hex id collided (retry) or the source vanished meanwhile.
			if (!(await shareableSource(tx, input.sourceUserId, input.sourceBookId))) {
				throw new SocialError("unavailable");
			}
			continue;
		}
		await tx.insert(syncBookCopy).values({
			userId: input.recipientId,
			bookId,
			originUserId: source.originUserId,
			originBookId: source.originBookId,
			via: input.via,
			createdAt: now,
		});
		return { bookId, created: true };
	}
	throw new Error("could not allocate a book id");
}
