import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, count, countDistinct, desc, eq, gt, gte, sum } from "drizzle-orm";
import { db } from "~/db";
import { session, user } from "~/db/auth-schema";
import { syncBooks, syncHighlights, syncSettings } from "~/db/schema";
import { auth } from "./auth";

async function requireAdminSession() {
	const request = getRequest();
	const s = await auth.api.getSession({ headers: request.headers });
	if (!s) throw new Response("Unauthorized", { status: 401 });
	if (s.user.email !== process.env.ADMIN_EMAIL)
		throw new Response("Forbidden", { status: 403 });
	return s;
}

export const checkAdminEmail = createServerFn({ method: "GET" }).handler(async () => {
	const request = getRequest();
	const s = await auth.api.getSession({ headers: request.headers });
	if (!s) return false;
	return s.user.email === process.env.ADMIN_EMAIL;
});

export const getAdminStats = createServerFn({ method: "GET" }).handler(async () => {
	await requireAdminSession();

	const now = new Date();
	const d7 = new Date(now.getTime() - 7 * 86_400_000);
	const d30 = new Date(now.getTime() - 30 * 86_400_000);

	const [
		usersResult,
		usersLast7dResult,
		usersLast30dResult,
		booksResult,
		usersWithBooksResult,
		highlightsResult,
		sessionsResult,
	] = await Promise.all([
		db.select({ count: count() }).from(user),
		db.select({ count: count() }).from(user).where(gte(user.createdAt, d7)),
		db.select({ count: count() }).from(user).where(gte(user.createdAt, d30)),
		db.select({ count: count(), totalSize: sum(syncBooks.fileSize) }).from(syncBooks),
		db.select({ count: countDistinct(syncBooks.userId) }).from(syncBooks),
		db.select({ count: count() }).from(syncHighlights).where(eq(syncHighlights.deleted, false)),
		db.select({ count: count() }).from(session).where(gt(session.expiresAt, now)),
	]);

	return {
		userTotal: usersResult[0]?.count ?? 0,
		usersLast7d: usersLast7dResult[0]?.count ?? 0,
		usersLast30d: usersLast30dResult[0]?.count ?? 0,
		bookTotal: booksResult[0]?.count ?? 0,
		storageTotalBytes: Number(booksResult[0]?.totalSize ?? 0),
		usersWithBooks: usersWithBooksResult[0]?.count ?? 0,
		highlightTotal: highlightsResult[0]?.count ?? 0,
		activeSessions: sessionsResult[0]?.count ?? 0,
	};
});

export const getAdminUsers = createServerFn({ method: "GET" }).handler(async () => {
	await requireAdminSession();

	const [users, bookCounts, highlightCounts] = await Promise.all([
		db.select({ id: user.id, email: user.email, createdAt: user.createdAt })
			.from(user)
			.orderBy(desc(user.createdAt)),
		db.select({ userId: syncBooks.userId, count: count() })
			.from(syncBooks)
			.groupBy(syncBooks.userId),
		db.select({ userId: syncHighlights.userId, count: count() })
			.from(syncHighlights)
			.where(eq(syncHighlights.deleted, false))
			.groupBy(syncHighlights.userId),
	]);

	const bookMap = new Map(bookCounts.map((r) => [r.userId, r.count]));
	const hlMap = new Map(highlightCounts.map((r) => [r.userId, r.count]));

	return users.map((u) => ({
		id: u.id,
		email: u.email,
		createdAt: u.createdAt.getTime(),
		bookCount: bookMap.get(u.id) ?? 0,
		highlightCount: hlMap.get(u.id) ?? 0,
	}));
});

export const getAdminBooks = createServerFn({ method: "GET" }).handler(async () => {
	await requireAdminSession();

	const rows = await db
		.select({
			bookId: syncBooks.bookId,
			userId: syncBooks.userId,
			userEmail: user.email,
			title: syncBooks.title,
			author: syncBooks.author,
			fileSize: syncBooks.fileSize,
			wordCount: syncBooks.wordCount,
			position: syncBooks.position,
			updatedAt: syncBooks.updatedAt,
		})
		.from(syncBooks)
		.leftJoin(user, eq(syncBooks.userId, user.id))
		.orderBy(desc(syncBooks.updatedAt));

	return rows.map((r) => ({ ...r, updatedAt: r.updatedAt.getTime() }));
});

export const deleteAdminUser = createServerFn({ method: "POST" })
	.inputValidator((data: { userId: string }) => data)
	.handler(async ({ data }) => {
		await requireAdminSession();
		await db.transaction(async (tx) => {
			await Promise.all([
				tx.delete(syncBooks).where(eq(syncBooks.userId, data.userId)),
				tx.delete(syncHighlights).where(eq(syncHighlights.userId, data.userId)),
				tx.delete(syncSettings).where(eq(syncSettings.userId, data.userId)),
			]);
			await tx.delete(user).where(eq(user.id, data.userId));
		});
		return { success: true };
	});

export const deleteAdminBook = createServerFn({ method: "POST" })
	.inputValidator((data: { userId: string; bookId: string }) => data)
	.handler(async ({ data }) => {
		await requireAdminSession();
		await db.transaction(async (tx) => {
			await tx
				.delete(syncHighlights)
				.where(
					and(
						eq(syncHighlights.userId, data.userId),
						eq(syncHighlights.bookId, data.bookId),
					),
				);
			await tx
				.delete(syncBooks)
				.where(and(eq(syncBooks.userId, data.userId), eq(syncBooks.bookId, data.bookId)));
		});
		return { success: true };
	});
