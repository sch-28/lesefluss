import type { SyncCollection, SyncCollectionBook } from "@lesefluss/core";
import { type SQL, sql } from "drizzle-orm";
import type { DbExecutor } from "~/db";
import { syncCollectionBooks, syncCollections } from "~/db/schema";

// Keeps each statement well under Postgres's 65535 bind parameters.
const CHUNK = 1000;

/**
 * Last-write-wins upsert of pushed collections, per row. Nothing is tombstoned
 * for being absent from a push. Stamps are stored as sent, like goals: every
 * push resends every row, so a clamped fast clock would win on each push.
 *
 * A client from before series collections omits `ordered` and `seriesKey`;
 * its rows win by stamp but leave the stored values of those fields alone.
 */
export async function upsertSyncCollections(
	exec: DbExecutor,
	userId: string,
	collections: SyncCollection[],
): Promise<void> {
	const newest = newestPerKey(collections, (c) => c.collectionId);
	const groups = groupByPresent(newest, ["ordered", "seriesKey"]);
	for (const [present, group] of groups) {
		const optional: Record<string, SQL> = {};
		if (present.has("ordered")) optional.ordered = sql`excluded.ordered`;
		if (present.has("seriesKey")) optional.seriesKey = sql`excluded.series_key`;
		for (const rows of chunks(group)) await upsertCollectionRows(exec, userId, rows, optional);
	}
}

async function upsertCollectionRows(
	exec: DbExecutor,
	userId: string,
	rows: SyncCollection[],
	optional: Record<string, SQL>,
): Promise<void> {
	await exec
		.insert(syncCollections)
		.values(
			rows.map((c) => ({
				userId,
				collectionId: c.collectionId,
				name: c.name,
				sortOrder: c.sortOrder,
				ordered: c.ordered,
				seriesKey: c.seriesKey,
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
				...optional,
				deleted: sql`excluded.deleted`,
				createdAt: sql`excluded.created_at`,
				updatedAt: sql`excluded.updated_at`,
			},
			setWhere: sql`excluded.updated_at > sync_collections.updated_at`,
		});
}

export async function upsertSyncCollectionBooks(
	exec: DbExecutor,
	userId: string,
	memberships: SyncCollectionBook[],
): Promise<void> {
	const unique = newestPerKey(memberships, (m) => `${m.collectionId}\u0000${m.bookId}`);
	for (const [present, group] of groupByPresent(unique, ["seriesIndex", "position"])) {
		const optional: Record<string, SQL> = {};
		if (present.has("seriesIndex")) optional.seriesIndex = sql`excluded.series_index`;
		if (present.has("position")) optional.position = sql`excluded.position`;
		for (const rows of chunks(group)) await upsertMembershipRows(exec, userId, rows, optional);
	}
}

async function upsertMembershipRows(
	exec: DbExecutor,
	userId: string,
	rows: SyncCollectionBook[],
	optional: Record<string, SQL>,
): Promise<void> {
	await exec
		.insert(syncCollectionBooks)
		.values(
			rows.map((m) => ({
				userId,
				collectionId: m.collectionId,
				bookId: m.bookId,
				seriesIndex: m.seriesIndex,
				position: m.position,
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
				...optional,
				deleted: sql`excluded.deleted`,
				updatedAt: sql`excluded.updated_at`,
			},
			setWhere: sql`excluded.updated_at > sync_collection_books.updated_at`,
		});
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

/** Splits rows by which of the optional fields they carry, so each group gets the `set` clause that leaves absent fields stored. */
function groupByPresent<T extends object, K extends keyof T & string>(
	rows: T[],
	fields: K[],
): Map<Set<K>, T[]> {
	const bySignature = new Map<string, { present: Set<K>; rows: T[] }>();
	for (const row of rows) {
		const present = fields.filter((f) => row[f] !== undefined);
		const signature = present.join(",");
		const group = bySignature.get(signature) ?? { present: new Set(present), rows: [] };
		group.rows.push(row);
		bySignature.set(signature, group);
	}
	return new Map([...bySignature.values()].map((g) => [g.present, g.rows]));
}

function* chunks<T>(rows: T[]): Generator<T[]> {
	for (let i = 0; i < rows.length; i += CHUNK) yield rows.slice(i, i + CHUNK);
}
