import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, count, countDistinct, desc, eq, gt, gte, isNotNull, isNull, sum } from "drizzle-orm";
import { db } from "~/db";
import { session, user } from "~/db/auth-schema";
import { syncBooks, syncHighlights, syncSeries, syncSettings } from "~/db/schema";
import { auth } from "./auth";
import { catalogFetch } from "./catalog";

async function requireAdminSession() {
	const request = getRequest();
	const s = await auth.api.getSession({ headers: request.headers });
	if (!s) throw new Response("Unauthorized", { status: 401 });
	if (s.user.role !== "admin") throw new Response("Forbidden", { status: 403 });
	return s;
}

// Standalone book (no series_id) predicate, shared by stats and cleanup so the
// numbers stay consistent with the admin Books table.
const standaloneBookOnly = isNull(syncBooks.seriesId);

export const getAdminStats = createServerFn({ method: "GET" }).handler(async () => {
	await requireAdminSession();

	const now = new Date();
	const d7 = new Date(now.getTime() - 7 * 86_400_000);
	const d30 = new Date(now.getTime() - 30 * 86_400_000);

	// Book counts are scoped to standalone books (series_id IS NULL) so the
	// admin Books table, which now hides chapter rows, and its tombstone toggle
	// stay numerically consistent. Storage still sums every row because chapters
	// consume real bytes. Series rows are counted separately.
	const [
		usersResult,
		usersLast7dResult,
		usersLast30dResult,
		booksResult,
		storageResult,
		usersWithBooksResult,
		highlightsResult,
		sessionsResult,
		bookTombstonesResult,
		bookTombstonesByUserResult,
		seriesResult,
		seriesTombstonesResult,
		seriesTombstonesByUserResult,
	] = await Promise.all([
		db.select({ count: count() }).from(user),
		db.select({ count: count() }).from(user).where(gte(user.createdAt, d7)),
		db.select({ count: count() }).from(user).where(gte(user.createdAt, d30)),
		db
			.select({ count: count() })
			.from(syncBooks)
			.where(and(eq(syncBooks.deleted, false), standaloneBookOnly)),
		db
			.select({ totalSize: sum(syncBooks.fileSize) })
			.from(syncBooks)
			.where(eq(syncBooks.deleted, false)),
		db
			.select({ count: countDistinct(syncBooks.userId) })
			.from(syncBooks)
			.where(eq(syncBooks.deleted, false)),
		db.select({ count: count() }).from(syncHighlights).where(eq(syncHighlights.deleted, false)),
		db.select({ count: count() }).from(session).where(gt(session.expiresAt, now)),
		db
			.select({ count: count() })
			.from(syncBooks)
			.where(and(eq(syncBooks.deleted, true), standaloneBookOnly)),
		db
			.select({ userId: syncBooks.userId, count: count() })
			.from(syncBooks)
			.where(and(eq(syncBooks.deleted, true), standaloneBookOnly))
			.groupBy(syncBooks.userId),
		db.select({ count: count() }).from(syncSeries).where(eq(syncSeries.deleted, false)),
		db.select({ count: count() }).from(syncSeries).where(eq(syncSeries.deleted, true)),
		db
			.select({ userId: syncSeries.userId, count: count() })
			.from(syncSeries)
			.where(eq(syncSeries.deleted, true))
			.groupBy(syncSeries.userId),
	]);

	return {
		userTotal: usersResult[0]?.count ?? 0,
		usersLast7d: usersLast7dResult[0]?.count ?? 0,
		usersLast30d: usersLast30dResult[0]?.count ?? 0,
		bookTotal: booksResult[0]?.count ?? 0,
		seriesTotal: seriesResult[0]?.count ?? 0,
		bookTombstoneTotal: bookTombstonesResult[0]?.count ?? 0,
		bookTombstonesByUser: bookTombstonesByUserResult.map((r) => ({
			userId: r.userId,
			count: r.count,
		})),
		seriesTombstoneTotal: seriesTombstonesResult[0]?.count ?? 0,
		seriesTombstonesByUser: seriesTombstonesByUserResult.map((r) => ({
			userId: r.userId,
			count: r.count,
		})),
		storageTotalBytes: Number(storageResult[0]?.totalSize ?? 0),
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
			.where(and(eq(syncBooks.deleted, false), standaloneBookOnly))
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

/**
 * Hard cap on rows shipped to the admin UI in a single call. Tombstones can
 * accumulate (one user has 13k+) and the admin table paginates client-side; a
 * 5k cap keeps the wire payload bounded while comfortably covering normal
 * browsing. Stats provides the true totals. (TASK-102)
 */
const ADMIN_BOOKS_LIMIT = 5000;

export const getAdminBooks = createServerFn({ method: "GET" }).handler(async () => {
	await requireAdminSession();

	// Tombstones included so admins can audit and clean up. Client-side toggle
	// hides them by default. (TASK-102)
	// Chapter rows (series_id set) belong to a serial and live under the
	// separate Series table, so exclude them here.
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
			deleted: syncBooks.deleted,
			updatedAt: syncBooks.updatedAt,
		})
		.from(syncBooks)
		.leftJoin(user, eq(syncBooks.userId, user.id))
		.where(standaloneBookOnly)
		.orderBy(desc(syncBooks.updatedAt))
		.limit(ADMIN_BOOKS_LIMIT);

	return rows.map((r) => ({ ...r, updatedAt: r.updatedAt.getTime() }));
});

export const getAdminSeries = createServerFn({ method: "GET" }).handler(async () => {
	await requireAdminSession();

	// Tombstones included so admins can audit and clean up; client-side toggle
	// hides them by default. Chapter aggregates count live chapters only.
	// Tombstoned series cascade their chapters to deleted=true, so a tombstoned
	// series reports 0 chapters and 0 bytes.
	const [seriesRows, chapterAggregates] = await Promise.all([
		db
			.select({
				seriesId: syncSeries.seriesId,
				userId: syncSeries.userId,
				userEmail: user.email,
				title: syncSeries.title,
				author: syncSeries.author,
				provider: syncSeries.provider,
				deleted: syncSeries.deleted,
				updatedAt: syncSeries.updatedAt,
			})
			.from(syncSeries)
			.leftJoin(user, eq(syncSeries.userId, user.id))
			.orderBy(desc(syncSeries.updatedAt)),
		db
			.select({
				userId: syncBooks.userId,
				seriesId: syncBooks.seriesId,
				chapterCount: count(),
				totalSize: sum(syncBooks.fileSize),
			})
			.from(syncBooks)
			.where(and(eq(syncBooks.deleted, false), isNotNull(syncBooks.seriesId)))
			.groupBy(syncBooks.userId, syncBooks.seriesId),
	]);

	const aggregateKey = (userId: string, seriesId: string) => `${userId}:${seriesId}`;
	const aggregates = new Map<string, { chapterCount: number; totalSize: number }>();
	for (const a of chapterAggregates) {
		if (a.seriesId === null) continue;
		aggregates.set(aggregateKey(a.userId, a.seriesId), {
			chapterCount: a.chapterCount,
			totalSize: Number(a.totalSize ?? 0),
		});
	}

	return seriesRows.map((s) => {
		const agg = aggregates.get(aggregateKey(s.userId, s.seriesId));
		return {
			...s,
			updatedAt: s.updatedAt.getTime(),
			chapterCount: agg?.chapterCount ?? 0,
			totalSize: agg?.totalSize ?? 0,
		};
	});
});

export const deleteAdminUser = createServerFn({ method: "POST" })
	.inputValidator((data: { userId: string }) => data)
	.handler(async ({ data }) => {
		await requireAdminSession();
		await db.transaction(async (tx) => {
			await Promise.all([
				tx.delete(syncBooks).where(eq(syncBooks.userId, data.userId)),
				tx.delete(syncSeries).where(eq(syncSeries.userId, data.userId)),
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
		// Soft-delete so the tombstone propagates to the user's devices on next pull.
		// Null out content columns to reclaim space; keeps the row as a sticky tombstone.
		// Highlights for the book are tombstoned in the same tx so they propagate too.
		const now = new Date();
		const result = await db.transaction(async (tx) => {
			const updated = await tx
				.update(syncBooks)
				.set({
					deleted: true,
					content: null,
					coverImage: null,
					chapters: null,
					updatedAt: now,
				})
				.where(and(eq(syncBooks.userId, data.userId), eq(syncBooks.bookId, data.bookId)))
				.returning({ bookId: syncBooks.bookId });
			if (updated.length === 0) return updated;
			await tx
				.update(syncHighlights)
				.set({ deleted: true, updatedAt: now })
				.where(
					and(
						eq(syncHighlights.userId, data.userId),
						eq(syncHighlights.bookId, data.bookId),
						eq(syncHighlights.deleted, false),
					),
				);
			return updated;
		});
		if (result.length === 0) throw new Response("Book not found", { status: 404 });
		return { success: true };
	});

export const deleteAdminSeries = createServerFn({ method: "POST" })
	.inputValidator((data: { userId: string; seriesId: string }) => data)
	.handler(async ({ data }) => {
		await requireAdminSession();
		// Soft-delete the series row and cascade-tombstone every chapter row in
		// sync_books, mirroring the cascade in routes/api/sync.ts so offline
		// devices learn about the deletion on the next pull.
		const now = new Date();
		const result = await db.transaction(async (tx) => {
			const updated = await tx
				.update(syncSeries)
				.set({ deleted: true, updatedAt: now })
				.where(and(eq(syncSeries.userId, data.userId), eq(syncSeries.seriesId, data.seriesId)))
				.returning({ seriesId: syncSeries.seriesId });
			if (updated.length === 0) return updated;
			await tx
				.update(syncBooks)
				.set({
					deleted: true,
					content: null,
					coverImage: null,
					chapters: null,
					updatedAt: now,
				})
				.where(
					and(
						eq(syncBooks.userId, data.userId),
						eq(syncBooks.seriesId, data.seriesId),
						eq(syncBooks.deleted, false),
					),
				);
			return updated;
		});
		if (result.length === 0) throw new Response("Series not found", { status: 404 });
		return { success: true };
	});

/**
 * Hard-delete tombstoned `sync_books` rows (and tombstoned `sync_highlights`
 * in the same scope). Optionally constrained to a single user. The server
 * keeps tombstones forever so offline devices can still learn about deletions
 * on next pull. This admin action lets the operator reclaim space when they
 * know it's safe (e.g. all of the user's devices have caught up). (TASK-102)
 */
export const hardDeleteAdminTombstones = createServerFn({ method: "POST" })
	.inputValidator((data: { userId?: string }) => data)
	.handler(async ({ data }) => {
		await requireAdminSession();
		const userScope = data.userId;
		// Standalone-only: matches the rows visible in the admin Books table so
		// the cleanup count stays accurate. Chapter tombstones are owned by their
		// parent series (cleaned up via deleteAdminSeries).
		const result = await db.transaction(async (tx) => {
			const removedBooks = await tx
				.delete(syncBooks)
				.where(
					userScope
						? and(eq(syncBooks.deleted, true), eq(syncBooks.userId, userScope), standaloneBookOnly)
						: and(eq(syncBooks.deleted, true), standaloneBookOnly),
				)
				.returning({ bookId: syncBooks.bookId });
			const removedHighlights = await tx
				.delete(syncHighlights)
				.where(
					userScope
						? and(eq(syncHighlights.deleted, true), eq(syncHighlights.userId, userScope))
						: eq(syncHighlights.deleted, true),
				)
				.returning({ highlightId: syncHighlights.highlightId });
			return {
				booksRemoved: removedBooks.length,
				highlightsRemoved: removedHighlights.length,
			};
		});
		return result;
	});

/**
 * Hard-delete tombstoned `sync_series` rows along with the chapter tombstones
 * they own in `sync_books`. Optionally constrained to a single user. Mirrors
 * `hardDeleteAdminTombstones` for the series side; chapter tombstones are
 * owned by their parent series, so they're cleaned up here rather than in the
 * book cleanup path.
 */
export const hardDeleteAdminSeriesTombstones = createServerFn({ method: "POST" })
	.inputValidator((data: { userId?: string }) => data)
	.handler(async ({ data }) => {
		await requireAdminSession();
		const userScope = data.userId;
		const result = await db.transaction(async (tx) => {
			const removedChapters = await tx
				.delete(syncBooks)
				.where(
					userScope
						? and(
								eq(syncBooks.deleted, true),
								eq(syncBooks.userId, userScope),
								isNotNull(syncBooks.seriesId),
							)
						: and(eq(syncBooks.deleted, true), isNotNull(syncBooks.seriesId)),
				)
				.returning({ bookId: syncBooks.bookId });
			const removedSeries = await tx
				.delete(syncSeries)
				.where(
					userScope
						? and(eq(syncSeries.deleted, true), eq(syncSeries.userId, userScope))
						: eq(syncSeries.deleted, true),
				)
				.returning({ seriesId: syncSeries.seriesId });
			return {
				seriesRemoved: removedSeries.length,
				chaptersRemoved: removedChapters.length,
			};
		});
		return result;
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
