import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, count, countDistinct, desc, eq, gt, gte, sum } from "drizzle-orm";
import { db } from "~/db";
import { session, user } from "~/db/auth-schema";
import { syncBooks, syncHighlights, syncSettings } from "~/db/schema";
import { auth } from "./auth";
import { catalogFetch } from "./catalog";

async function requireAdminSession() {
	const request = getRequest();
	const s = await auth.api.getSession({ headers: request.headers });
	if (!s) throw new Response("Unauthorized", { status: 401 });
	if (s.user.role !== "admin") throw new Response("Forbidden", { status: 403 });
	return s;
}

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
		db
			.select({ id: user.id, email: user.email, createdAt: user.createdAt })
			.from(user)
			.orderBy(desc(user.createdAt)),
		db
			.select({ userId: syncBooks.userId, count: count() })
			.from(syncBooks)
			.groupBy(syncBooks.userId),
		db
			.select({ userId: syncHighlights.userId, count: count() })
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
				.where(and(eq(syncHighlights.userId, data.userId), eq(syncHighlights.bookId, data.bookId)));
			await tx
				.delete(syncBooks)
				.where(and(eq(syncBooks.userId, data.userId), eq(syncBooks.bookId, data.bookId)));
		});
		return { success: true };
	});

// ---------------------------------------------------------------------------
// Catalog (apps/catalog) admin proxy
// ---------------------------------------------------------------------------

type CatalogStatsPayload = {
	sync: {
		running: boolean;
		currentSource: "gutenberg" | "standard_ebooks" | "dedup" | null;
		phase: string | null;
		booksUpserted: number;
		booksSuppressed: number;
		lastStartedAt: string | null;
		lastFinishedAt: string | null;
		lastError: string | null;
	};
	counts: {
		gutenberg: number;
		standardEbooks: number;
		suppressed: number;
		total: number;
	};
};

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export type CatalogStatsResult = Result<CatalogStatsPayload>;
export type CatalogSyncResult = Result<null>;

export type CatalogSyncSource = "gutenberg" | "standard_ebooks" | "all";

export const getCatalogStats = createServerFn({ method: "GET" }).handler(
	async (): Promise<CatalogStatsResult> => {
		await requireAdminSession();
		const r = await catalogFetch("/admin/stats", { auth: "admin" });
		if (!r.ok) return r;
		if (!r.data.ok) return { ok: false, error: `Catalog stats failed: HTTP ${r.data.status}` };
		const data = (await r.data.json()) as CatalogStatsPayload;
		return { ok: true, data };
	},
);

export const triggerCatalogSync = createServerFn({ method: "POST" })
	.inputValidator((data: { source: CatalogSyncSource }) => data)
	.handler(async ({ data }): Promise<CatalogSyncResult> => {
		await requireAdminSession();
		const r = await catalogFetch("/admin/sync", {
			auth: "admin",
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ source: data.source }),
		});
		if (!r.ok) return r;
		if (!r.data.ok && r.data.status !== 202) {
			return { ok: false, error: `Catalog sync trigger failed: HTTP ${r.data.status}` };
		}
		return { ok: true, data: null };
	});
