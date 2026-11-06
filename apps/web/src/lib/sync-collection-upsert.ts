import type { SyncCollection, SyncCollectionBook } from "@lesefluss/core";
import { sql } from "drizzle-orm";
import type { DbExecutor } from "~/db";
import { syncCollectionBooks, syncCollections } from "~/db/schema";

// Keeps each statement well under Postgres's 65535 bind parameters.
const CHUNK = 1000;

/**
 * Last-write-wins upsert of pushed collections, per row. Nothing is tombstoned
 * for being absent from a push. Stamps are stored as sent, like goals: every
 * push resends every row, so a clamped fast clock would win on each push.
 */
export async function upsertSyncCollections(
	exec: DbExecutor,
	userId: string,
	collections: SyncCollection[],
): Promise<void> {
	for (const rows of chunks(newestPerKey(collections, (c) => c.collectionId))) {
		await exec
			.insert(syncCollections)
			.values(
				rows.map((c) => ({
					userId,
					collectionId: c.collectionId,
					name: c.name,
					sortOrder: c.sortOrder,
					deleted: c.deleted,
					createdAt: new Date(c.createdAt),
					updatedAt: new Date(c.updatedAt),
				})),
			)
			.onConflictDoUpdate({
				target: [syncCollections.userId, syncCollections.collectionId],
				set: {
					name: sql`excluded.name`,
					sortOrder: sql`excluded.sort_order`,
					deleted: sql`excluded.deleted`,
					createdAt: sql`excluded.created_at`,
					updatedAt: sql`excluded.updated_at`,
				},
				setWhere: sql`excluded.updated_at > sync_collections.updated_at`,
			});
	}
}

export async function upsertSyncCollectionBooks(
	exec: DbExecutor,
	userId: string,
	memberships: SyncCollectionBook[],
): Promise<void> {
	const unique = newestPerKey(memberships, (m) => `${m.collectionId}\u0000${m.bookId}`);
	for (const rows of chunks(unique)) {
		await exec
			.insert(syncCollectionBooks)
			.values(
				rows.map((m) => ({
					userId,
					collectionId: m.collectionId,
					bookId: m.bookId,
					deleted: m.deleted,
					updatedAt: new Date(m.updatedAt),
				})),
			)
			.onConflictDoUpdate({
				target: [
					syncCollectionBooks.userId,
					syncCollectionBooks.collectionId,
					syncCollectionBooks.bookId,
				],
				set: {
					deleted: sql`excluded.deleted`,
					updatedAt: sql`excluded.updated_at`,
				},
				setWhere: sql`excluded.updated_at > sync_collection_books.updated_at`,
			});
	}
}

/** One statement may not upsert the same key twice, so duplicates in a push collapse to the newest. */
function newestPerKey<T extends { updatedAt: number }>(rows: T[], key: (row: T) => string): T[] {
	const byKey = new Map<string, T>();
	for (const row of rows) {
		const k = key(row);
		const seen = byKey.get(k);
		if (!seen || row.updatedAt > seen.updatedAt) byKey.set(k, row);
	}
	return [...byKey.values()];
}

function* chunks<T>(rows: T[]): Generator<T[]> {
	for (let i = 0; i < rows.length; i += CHUNK) yield rows.slice(i, i + CHUNK);
}
