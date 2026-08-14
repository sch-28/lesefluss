import { isFinishedPercent, readingProgress } from "@lesefluss/core";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, count, desc, eq, isNotNull, max, or } from "drizzle-orm";
import { db } from "~/db";
import { syncBooks, syncGlossaryEntries, syncHighlights, syncSettings } from "~/db/schema";
import { deleteUserAccount } from "./account-deletion";
import { auth } from "./auth";

async function requireSession() {
	const request = getRequest();
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session) throw new Response("Unauthorized", { status: 401 });
	return session;
}

export const getProfileStats = createServerFn({ method: "GET" }).handler(async () => {
	const session = await requireSession();
	const userId = session.user.id;

	const [
		booksResult,
		highlightsResult,
		glossaryResult,
		settingsMax,
		books,
		highlights,
		glossaryEntries,
	] = await Promise.all([
		db
			.select({ ts: max(syncBooks.updatedAt) })
			.from(syncBooks)
			.where(and(eq(syncBooks.userId, userId), eq(syncBooks.deleted, false))),
		db
			.select({ count: count(), ts: max(syncHighlights.updatedAt) })
			.from(syncHighlights)
			.where(and(eq(syncHighlights.userId, userId), eq(syncHighlights.deleted, false))),
		db
			.select({ count: count(), ts: max(syncGlossaryEntries.updatedAt) })
			.from(syncGlossaryEntries)
			.where(and(eq(syncGlossaryEntries.userId, userId), eq(syncGlossaryEntries.deleted, false))),
		db
			.select({ ts: max(syncSettings.updatedAt) })
			.from(syncSettings)
			.where(eq(syncSettings.userId, userId)),
		db
			.select({
				bookId: syncBooks.bookId,
				title: syncBooks.title,
				author: syncBooks.author,
				coverImage: syncBooks.coverImage,
				wordPosition: syncBooks.wordPosition,
				fileSize: syncBooks.fileSize,
				wordCount: syncBooks.wordCount,
				status: syncBooks.status,
				rating: syncBooks.rating,
				tags: syncBooks.tags,
				description: syncBooks.description,
			})
			.from(syncBooks)
			.where(and(eq(syncBooks.userId, userId), eq(syncBooks.deleted, false)))
			.orderBy(desc(syncBooks.updatedAt)),
		db
			.select({
				highlightId: syncHighlights.highlightId,
				color: syncHighlights.color,
				text: syncHighlights.text,
				note: syncHighlights.note,
				updatedAt: syncHighlights.updatedAt,
				bookTitle: syncBooks.title,
			})
			.from(syncHighlights)
			.innerJoin(
				syncBooks,
				and(
					eq(syncHighlights.bookId, syncBooks.bookId),
					eq(syncHighlights.userId, syncBooks.userId),
				),
			)
			.where(
				and(
					eq(syncHighlights.userId, userId),
					eq(syncHighlights.deleted, false),
					eq(syncBooks.deleted, false),
					or(isNotNull(syncHighlights.text), isNotNull(syncHighlights.note)),
				),
			)
			.orderBy(desc(syncHighlights.updatedAt))
			.limit(500),
		db
			.select({
				entryId: syncGlossaryEntries.entryId,
				bookId: syncGlossaryEntries.bookId,
				label: syncGlossaryEntries.label,
				notes: syncGlossaryEntries.notes,
				color: syncGlossaryEntries.color,
				updatedAt: syncGlossaryEntries.updatedAt,
				bookTitle: syncBooks.title,
			})
			.from(syncGlossaryEntries)
			// LEFT JOIN so global entries (bookId IS NULL) come through
			.leftJoin(
				syncBooks,
				and(
					eq(syncGlossaryEntries.bookId, syncBooks.bookId),
					eq(syncGlossaryEntries.userId, syncBooks.userId),
				),
			)
			.where(and(eq(syncGlossaryEntries.userId, userId), eq(syncGlossaryEntries.deleted, false)))
			.orderBy(desc(syncGlossaryEntries.updatedAt))
			.limit(500),
	]);

	const candidates = [
		booksResult[0]?.ts,
		highlightsResult[0]?.ts,
		glossaryResult[0]?.ts,
		settingsMax[0]?.ts,
	].filter(Boolean) as Date[];
	const lastSynced = candidates.length ? Math.max(...candidates.map((d) => d.getTime())) : null;

	let booksFinished = 0;
	let wordsRead = 0;
	for (const b of books) {
		const percent = readingProgress({ wordCount: b.wordCount ?? 0, wordPosition: b.wordPosition });
		if (isFinishedPercent(percent)) booksFinished++;
		if (b.wordCount) wordsRead += b.wordPosition;
	}

	return {
		bookCount: books.length,
		highlightCount: highlightsResult[0]?.count ?? 0,
		glossaryCount: glossaryResult[0]?.count ?? 0,
		lastSynced,
		booksFinished,
		wordsRead,
		books,
		highlights: highlights.map((h) => ({
			...h,
			updatedAt: h.updatedAt.getTime(),
		})),
		glossaryEntries: glossaryEntries.map((e) => ({
			...e,
			updatedAt: e.updatedAt.getTime(),
		})),
	};
});

export const clearCloudData = createServerFn({ method: "POST" }).handler(async () => {
	const session = await requireSession();
	const userId = session.user.id;

	await db.transaction(async (tx) => {
		await Promise.all([
			tx.delete(syncBooks).where(eq(syncBooks.userId, userId)),
			tx.delete(syncHighlights).where(eq(syncHighlights.userId, userId)),
			tx.delete(syncGlossaryEntries).where(eq(syncGlossaryEntries.userId, userId)),
			tx.delete(syncSettings).where(eq(syncSettings.userId, userId)),
		]);
	});

	return { success: true };
});

// Authorized by the active session alone; see deleteUserAccount for why no
// password is required and how the deletion cascades.
export const deleteAccount = createServerFn({ method: "POST" }).handler(async () => {
	const session = await requireSession();
	await deleteUserAccount(session.user.id);
	return { success: true };
});
