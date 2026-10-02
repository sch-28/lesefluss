import { and, desc, eq, isNotNull, isNull, max } from "drizzle-orm";
import { db } from "../index";
import { books, readingSessions } from "../schema";

/**
 * The book the user was last reading, or null when nothing has been read yet.
 *
 * Serial chapters can't use `lastRead`: fetching a chapter (including a
 * "download all" batch, locked and error results) stamps it too. Chapters are
 * ranked by their newest reading session instead, and only fetched ones count.
 */
export async function getLastReadBookId(): Promise<string | null> {
	const [standalone] = await db
		.select({ id: books.id, at: books.lastRead })
		.from(books)
		.where(and(eq(books.deleted, false), isNull(books.seriesId), isNotNull(books.lastRead)))
		.orderBy(desc(books.lastRead))
		.limit(1);

	const lastEnded = max(readingSessions.endedAt);
	const [chapter] = await db
		.select({ id: books.id, at: lastEnded })
		.from(readingSessions)
		.innerJoin(books, eq(books.id, readingSessions.bookId))
		.where(
			and(eq(books.deleted, false), isNotNull(books.seriesId), eq(books.chapterStatus, "fetched")),
		)
		.groupBy(books.id)
		.orderBy(desc(lastEnded))
		.limit(1);

	if (chapter?.at != null && (standalone?.at == null || chapter.at > standalone.at)) {
		return chapter.id;
	}
	return standalone?.id ?? null;
}
