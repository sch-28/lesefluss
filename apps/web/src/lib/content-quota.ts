import {
	CONTENT_QUOTA_EXCEEDED,
	type ContentQuota,
	type ContentQuotaExceeded,
	type SyncBook,
} from "@lesefluss/core";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { DbExecutor, Tx } from "~/db";
import { syncBooks } from "~/db/schema";

/**
 * Per-account cap on the bytes live `sync_books` rows hold in their blob
 * columns (content, cover, chapters, link ranges), measured server-side with
 * `octet_length`. `file_size` is not used: the client sends it and could claim
 * 0 for anything. Tombstoned rows hold no content and do not count. Shared
 * copies (ADR-0004) count against the recipient.
 *
 * 500 MB is a few hundred novels with covers; override with
 * `SYNC_CONTENT_QUOTA_BYTES`.
 */
export const DEFAULT_CONTENT_QUOTA_BYTES = 500 * 1024 * 1024;

export function contentQuotaBytes(): number {
	const fromEnv = Number(process.env.SYNC_CONTENT_QUOTA_BYTES);
	return Number.isSafeInteger(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_CONTENT_QUOTA_BYTES;
}

export class ContentQuotaExceededError extends Error {
	constructor(readonly quota: ContentQuota) {
		super(CONTENT_QUOTA_EXCEEDED);
	}
}

export function contentQuotaExceededResponse(
	quota: ContentQuota,
	rejectedContentBookIds: string[] = [],
): Response {
	const body: ContentQuotaExceeded = {
		error: "Storage quota exceeded",
		code: CONTENT_QUOTA_EXCEEDED,
		rejectedContentBookIds,
		...quota,
	};
	return Response.json(body, { status: 413 });
}

const bytesOf = (column: unknown) => sql<number>`COALESCE(octet_length(${column}), 0)`;

/** What one `sync_books` row counts against the quota. */
export const rowBlobBytes = sql<number>`(${bytesOf(syncBooks.content)} + ${bytesOf(syncBooks.coverImage)} + ${bytesOf(syncBooks.chapters)} + ${bytesOf(syncBooks.linkRanges)})`;

/**
 * Serialises every write that can grow one account's usage, so two concurrent
 * pushes or imports cannot each see room for themselves and together overshoot.
 * Released when the transaction ends; taking it again in the same transaction
 * is harmless.
 */
export async function lockContentQuota(tx: Tx, userId: string): Promise<void> {
	await tx.execute(
		sql`SELECT pg_advisory_xact_lock(hashtextextended(${`content-quota:${userId}`}, 0))`,
	);
}

export async function contentUsage(exec: DbExecutor, userId: string): Promise<number> {
	const [row] = await exec
		.select({
			used: sql<string>`COALESCE(SUM(${rowBlobBytes}), 0)`,
		})
		.from(syncBooks)
		.where(and(eq(syncBooks.userId, userId), eq(syncBooks.deleted, false)));
	return Number(row?.used ?? 0);
}

/**
 * Locks the account's quota and throws if `addedBytes` more would exceed it.
 * For writes that add one whole row (article import, share copy).
 */
export async function reserveContentQuota(
	tx: Tx,
	userId: string,
	addedBytes: number,
	quotaBytes = contentQuotaBytes(),
): Promise<void> {
	await lockContentQuota(tx, userId);
	const usedBytes = await contentUsage(tx, userId);
	if (usedBytes + addedBytes > quotaBytes) {
		throw new ContentQuotaExceededError({ usedBytes, quotaBytes });
	}
}

export function utf8Bytes(value: string | null | undefined): number {
	return value ? Buffer.byteLength(value, "utf8") : 0;
}

/** `rowBlobBytes` for a row not yet written. */
export function newRowBlobBytes(row: typeof syncBooks.$inferInsert): number {
	return (
		utf8Bytes(row.content) +
		utf8Bytes(row.coverImage) +
		utf8Bytes(row.chapters) +
		utf8Bytes(row.linkRanges)
	);
}

export type StoredBlobBytes = {
	deleted: boolean;
	content: number;
	coverImage: number;
	chapters: number;
	linkRanges: number;
};

const storedTotal = (s: StoredBlobBytes) => s.content + s.coverImage + s.chapters + s.linkRanges;

function carriesBlobs(book: SyncBook): boolean {
	return book.content != null || book.coverImage != null || book.chapters != null;
}

/**
 * The row's blob bytes once this push is merged, mirroring `bookUpsertSet`: a
 * tombstone on either side clears the row, a chapter row stores no body, and an
 * absent field keeps the stored value. Pushed link ranges are not stored.
 *
 * Repeated entries for one book can land in separate upsert statements (one per
 * merge-rule group), so each column is charged its largest candidate rather than
 * trusting any one entry to be the last write.
 */
function bytesAfterMerge(entries: SyncBook[], stored: StoredBlobBytes | undefined): number {
	const live = entries.filter((book) => !book.deleted);
	if (live.length === 0 || stored?.deleted) return 0;
	const largest = (field: "content" | "coverImage" | "chapters", kept: number) =>
		Math.max(
			...live.map((book) => {
				if (book.seriesId) return 0;
				const pushed = book[field];
				return pushed != null ? utf8Bytes(pushed) : kept;
			}),
		);
	return (
		largest("content", stored?.content ?? 0) +
		largest("coverImage", stored?.coverImage ?? 0) +
		largest("chapters", stored?.chapters ?? 0) +
		(stored?.linkRanges ?? 0)
	);
}

/**
 * Which pushed books must have their content left out to stay within the
 * quota, and the usage after the push. Books that free or keep space are
 * applied first, so a push that deletes one book and adds another nets out;
 * growing books are then admitted in payload order while they fit. Updating a
 * book's stored content counts only the difference.
 */
export function planContentQuota(
	books: SyncBook[],
	stored: ReadonlyMap<string, StoredBlobBytes>,
	usedBytes: number,
	quotaBytes: number,
): { rejected: Set<string>; usedBytes: number } {
	const entriesById = Map.groupBy(books, (book) => book.bookId);
	let projected = usedBytes;
	const growing: { bookId: string; delta: number }[] = [];
	for (const [bookId, entries] of entriesById) {
		const before = stored.get(bookId);
		const delta =
			bytesAfterMerge(entries, before) - (before && !before.deleted ? storedTotal(before) : 0);
		if (delta <= 0) projected += delta;
		else growing.push({ bookId, delta });
	}
	const rejected = new Set<string>();
	for (const { bookId, delta } of growing) {
		if (projected + delta <= quotaBytes) projected += delta;
		else rejected.add(bookId);
	}
	return { rejected, usedBytes: projected };
}

/**
 * Applies the quota to a sync push. The caller must hold `lockContentQuota`
 * for the whole push transaction, so the upsert writes under the same check.
 *
 * A rejected book is still upserted, minus its content, so its position,
 * metadata and highlights keep syncing. A server row without content is skipped
 * by other devices' pull, so it never shows up there as an empty book.
 */
export async function fitPushToContentQuota(
	tx: Tx,
	userId: string,
	books: SyncBook[],
	quotaBytes = contentQuotaBytes(),
): Promise<{ books: SyncBook[]; rejected: string[]; quota: ContentQuota }> {
	const usedBytes = await contentUsage(tx, userId);
	const relevantIds = books.filter((b) => b.deleted || carriesBlobs(b)).map((b) => b.bookId);
	if (relevantIds.length === 0) {
		return { books, rejected: [], quota: { usedBytes, quotaBytes } };
	}

	const rows = await tx
		.select({
			bookId: syncBooks.bookId,
			deleted: syncBooks.deleted,
			content: bytesOf(syncBooks.content),
			coverImage: bytesOf(syncBooks.coverImage),
			chapters: bytesOf(syncBooks.chapters),
			linkRanges: bytesOf(syncBooks.linkRanges),
		})
		.from(syncBooks)
		.where(and(eq(syncBooks.userId, userId), inArray(syncBooks.bookId, relevantIds)));
	const stored = new Map(
		rows.map((r) => [
			r.bookId,
			{
				deleted: r.deleted,
				content: Number(r.content),
				coverImage: Number(r.coverImage),
				chapters: Number(r.chapters),
				linkRanges: Number(r.linkRanges),
			},
		]),
	);
	const relevant = new Set(relevantIds);
	const plan = planContentQuota(
		books.filter((b) => relevant.has(b.bookId)),
		stored,
		usedBytes,
		quotaBytes,
	);
	return {
		books: books.map((book) =>
			plan.rejected.has(book.bookId)
				? { ...book, content: undefined, coverImage: undefined, chapters: undefined }
				: book,
		),
		rejected: [...plan.rejected],
		quota: { usedBytes: plan.usedBytes, quotaBytes },
	};
}
