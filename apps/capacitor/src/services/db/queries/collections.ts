import { COLLECTION_NAME_MAX } from "@lesefluss/core";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { randomHexId } from "../../../utils/random-id";
import { serverNow } from "../../sync/server-clock";
import { db } from "../index";
import {
	books,
	type Collection,
	type CollectionBook,
	collectionBooks,
	collections,
} from "../schema";

// 4 bound columns per row stays well under SQLite's 999 parameters.
const CHUNK_SIZE = 200;
// Below this gap a midpoint stops being distinct from its neighbours.
const MIN_SORT_GAP = 1e-9;

export type CollectionWithCount = Collection & { bookCount: number };

/**
 * Membership rows of a deleted book are never written: a book tombstoned here
 * or hard-deleted after another device's delete drops out through this join.
 */
const liveMember = and(
	eq(collectionBooks.deleted, false),
	sql`EXISTS (SELECT 1 FROM ${books} WHERE ${books.id} = ${collectionBooks.bookId} AND ${books.deleted} = 0)`,
);

export function normalizeCollectionName(name: string): string {
	return name.trim().slice(0, COLLECTION_NAME_MAX);
}

export async function getCollections(): Promise<CollectionWithCount[]> {
	const bookCount = sql<number>`(SELECT count(*) FROM ${collectionBooks} WHERE ${collectionBooks.collectionId} = ${collections.id} AND ${liveMember})`;
	const rows = await db
		.select({
			id: collections.id,
			name: collections.name,
			sortOrder: collections.sortOrder,
			deleted: collections.deleted,
			createdAt: collections.createdAt,
			updatedAt: collections.updatedAt,
			bookCount,
		})
		.from(collections)
		.where(eq(collections.deleted, false))
		.orderBy(asc(collections.sortOrder), asc(collections.createdAt), asc(collections.id));
	return rows.map((r) => ({ ...r, bookCount: Number(r.bookCount) }));
}

export async function createCollection(name: string, now = serverNow()): Promise<Collection> {
	const trimmed = normalizeCollectionName(name);
	if (!trimmed) throw new Error("Collection name is empty");
	const [last] = await db
		.select({ sortOrder: collections.sortOrder })
		.from(collections)
		.where(eq(collections.deleted, false))
		.orderBy(sql`${collections.sortOrder} DESC`)
		.limit(1);
	const row: Collection = {
		id: randomHexId(),
		name: trimmed,
		sortOrder: (last?.sortOrder ?? 0) + 1,
		deleted: false,
		createdAt: now,
		updatedAt: now,
	};
	await db.insert(collections).values(row);
	return row;
}

export async function renameCollection(id: string, name: string, now = serverNow()): Promise<void> {
	const trimmed = normalizeCollectionName(name);
	if (!trimmed) throw new Error("Collection name is empty");
	await db.update(collections).set({ name: trimmed, updatedAt: now }).where(eq(collections.id, id));
}

/** Moves a collection to `toIndex` in the visible order, writing one row (or all, once gaps run out). */
export async function moveCollection(
	id: string,
	toIndex: number,
	now = serverNow(),
): Promise<void> {
	const ordered = await getCollections();
	const others = ordered.filter((c) => c.id !== id);
	if (others.length === ordered.length) return;
	const index = Math.max(0, Math.min(toIndex, others.length));
	const before = others[index - 1]?.sortOrder;
	const after = others[index]?.sortOrder;
	const sortOrder =
		before === undefined
			? (after ?? 1) - 1
			: after === undefined
				? before + 1
				: (before + after) / 2;

	const crowded =
		(before !== undefined && sortOrder - before < MIN_SORT_GAP) ||
		(after !== undefined && after - sortOrder < MIN_SORT_GAP);
	if (!crowded) {
		await db.update(collections).set({ sortOrder, updatedAt: now }).where(eq(collections.id, id));
		return;
	}
	const moved = ordered.find((c) => c.id === id) as CollectionWithCount;
	const renumbered = [...others.slice(0, index), moved, ...others.slice(index)];
	for (const [i, c] of renumbered.entries()) {
		await db
			.update(collections)
			.set({ sortOrder: i + 1, updatedAt: now })
			.where(eq(collections.id, c.id));
	}
}

/** Tombstones the collection and its memberships. The books stay in the library. */
export async function deleteCollection(id: string, now = serverNow()): Promise<void> {
	await db.update(collections).set({ deleted: true, updatedAt: now }).where(eq(collections.id, id));
	await db
		.update(collectionBooks)
		.set({ deleted: true, updatedAt: now })
		.where(and(eq(collectionBooks.collectionId, id), eq(collectionBooks.deleted, false)));
}

export async function addBooksToCollection(
	collectionId: string,
	bookIds: string[],
	now = serverNow(),
): Promise<void> {
	const unique = [...new Set(bookIds)];
	for (let i = 0; i < unique.length; i += CHUNK_SIZE) {
		await db
			.insert(collectionBooks)
			.values(
				unique
					.slice(i, i + CHUNK_SIZE)
					.map((bookId) => ({ collectionId, bookId, deleted: false, updatedAt: now })),
			)
			.onConflictDoUpdate({
				target: [collectionBooks.collectionId, collectionBooks.bookId],
				set: { deleted: false, updatedAt: now },
			});
	}
}

export async function removeBooksFromCollection(
	collectionId: string,
	bookIds: string[],
	now = serverNow(),
): Promise<void> {
	for (let i = 0; i < bookIds.length; i += CHUNK_SIZE) {
		await db
			.update(collectionBooks)
			.set({ deleted: true, updatedAt: now })
			.where(
				and(
					eq(collectionBooks.collectionId, collectionId),
					eq(collectionBooks.deleted, false),
					inArray(collectionBooks.bookId, bookIds.slice(i, i + CHUNK_SIZE)),
				),
			);
	}
}

export async function getCollectionBookIds(collectionId: string): Promise<string[]> {
	const rows = await db
		.select({ bookId: collectionBooks.bookId })
		.from(collectionBooks)
		.where(and(eq(collectionBooks.collectionId, collectionId), liveMember));
	return rows.map((r) => r.bookId);
}

/** Every live membership of a live collection, as book id → collection ids. */
export async function getCollectionMemberships(): Promise<Map<string, string[]>> {
	const rows = await db
		.select({ bookId: collectionBooks.bookId, collectionId: collectionBooks.collectionId })
		.from(collectionBooks)
		.innerJoin(collections, eq(collections.id, collectionBooks.collectionId))
		.where(and(liveMember, eq(collections.deleted, false)));
	const byBook = new Map<string, string[]>();
	for (const { bookId, collectionId } of rows) {
		const ids = byBook.get(bookId);
		if (ids) ids.push(collectionId);
		else byBook.set(bookId, [collectionId]);
	}
	return byBook;
}

/** The live collections a book is in. */
export async function getCollectionIdsForBook(bookId: string): Promise<string[]> {
	const rows = await db
		.select({ collectionId: collectionBooks.collectionId })
		.from(collectionBooks)
		.innerJoin(collections, eq(collections.id, collectionBooks.collectionId))
		.where(
			and(
				eq(collectionBooks.bookId, bookId),
				eq(collectionBooks.deleted, false),
				eq(collections.deleted, false),
			),
		);
	return rows.map((r) => r.collectionId);
}

/** Every row, tombstones included: a push always resends them so deletes reach the server. */
export async function getAllCollectionsForSync(): Promise<Collection[]> {
	return db.select().from(collections);
}

export async function getAllCollectionBooksForSync(): Promise<CollectionBook[]> {
	return db.select().from(collectionBooks);
}

export async function upsertCollections(rows: Collection[]): Promise<void> {
	for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
		await db
			.insert(collections)
			.values(rows.slice(i, i + CHUNK_SIZE))
			.onConflictDoUpdate({
				target: collections.id,
				set: {
					name: sql`excluded.name`,
					sortOrder: sql`excluded.sort_order`,
					deleted: sql`excluded.deleted`,
					createdAt: sql`excluded.created_at`,
					updatedAt: sql`excluded.updated_at`,
				},
				where: sql`${collections.updatedAt} < excluded.updated_at`,
			});
	}
}

export async function upsertCollectionBooks(rows: CollectionBook[]): Promise<void> {
	for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
		await db
			.insert(collectionBooks)
			.values(rows.slice(i, i + CHUNK_SIZE))
			.onConflictDoUpdate({
				target: [collectionBooks.collectionId, collectionBooks.bookId],
				set: { deleted: sql`excluded.deleted`, updatedAt: sql`excluded.updated_at` },
				where: sql`${collectionBooks.updatedAt} < excluded.updated_at`,
			});
	}
}
