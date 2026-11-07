import {
	COLLECTION_BOOKS_PUSH_MAX,
	COLLECTIONS_PUSH_MAX,
	type SyncCollection,
	type SyncCollectionBook,
	SyncCollectionBookSchema,
	SyncCollectionSchema,
} from "@lesefluss/core";
import type { Collection, CollectionBook } from "../db/schema";

export function collectionToSync(c: Collection): SyncCollection {
	return {
		collectionId: c.id,
		name: c.name,
		sortOrder: c.sortOrder,
		ordered: c.ordered,
		seriesKey: c.seriesKey,
		deleted: c.deleted,
		createdAt: c.createdAt,
		updatedAt: c.updatedAt,
	};
}

export function collectionBookToSync(m: CollectionBook): SyncCollectionBook {
	return {
		collectionId: m.collectionId,
		bookId: m.bookId,
		seriesIndex: m.seriesIndex,
		position: m.position,
		deleted: m.deleted,
		updatedAt: m.updatedAt,
	};
}

/**
 * Newest-wins per row, tombstones kept: the server rows that beat the local
 * copy, ready to upsert. Pure so the merge rules can be tested without a database.
 * A field the server omits (a server older than series collections) keeps the
 * local value.
 */
export function buildCollectionMerge(
	local: { collections: Collection[]; collectionBooks: CollectionBook[] },
	server: { collections: unknown[]; collectionBooks: unknown[] },
): { collections: Collection[]; collectionBooks: CollectionBook[]; rejected: number } {
	let rejected = 0;
	const localCollections = new Map(local.collections.map((c) => [c.id, c]));
	const collections: Collection[] = [];
	for (const raw of server.collections) {
		const parsed = SyncCollectionSchema.safeParse(raw);
		if (!parsed.success) {
			rejected++;
			continue;
		}
		const c = parsed.data;
		const mine = localCollections.get(c.collectionId);
		if (mine !== undefined && c.updatedAt <= mine.updatedAt) continue;
		collections.push({
			id: c.collectionId,
			name: c.name,
			sortOrder: c.sortOrder,
			ordered: c.ordered ?? mine?.ordered ?? false,
			seriesKey: c.seriesKey !== undefined ? c.seriesKey : (mine?.seriesKey ?? null),
			deleted: c.deleted,
			createdAt: c.createdAt,
			updatedAt: c.updatedAt,
		});
	}

	const localMembers = new Map(
		local.collectionBooks.map((m) => [memberKey(m.collectionId, m.bookId), m]),
	);
	const collectionBooks: CollectionBook[] = [];
	for (const raw of server.collectionBooks) {
		const parsed = SyncCollectionBookSchema.safeParse(raw);
		if (!parsed.success) {
			rejected++;
			continue;
		}
		const m = parsed.data;
		const mine = localMembers.get(memberKey(m.collectionId, m.bookId));
		if (mine !== undefined && m.updatedAt <= mine.updatedAt) continue;
		collectionBooks.push({
			collectionId: m.collectionId,
			bookId: m.bookId,
			seriesIndex: m.seriesIndex !== undefined ? m.seriesIndex : (mine?.seriesIndex ?? null),
			position: m.position !== undefined ? m.position : (mine?.position ?? null),
			deleted: m.deleted,
			updatedAt: m.updatedAt,
		});
	}
	return { collections, collectionBooks, rejected };
}

/** Same reasoning as `pushableGoals`: one bad row would 400 the whole push. */
export function pushableCollections(local: {
	collections: Collection[];
	collectionBooks: CollectionBook[];
}) {
	const collections = local.collections
		.map(collectionToSync)
		.filter((row) => SyncCollectionSchema.safeParse(row).success);
	const collectionBooks = local.collectionBooks
		.map(collectionBookToSync)
		.filter((row) => SyncCollectionBookSchema.safeParse(row).success);
	const rejected =
		local.collections.length +
		local.collectionBooks.length -
		collections.length -
		collectionBooks.length;
	// Over the server's cap the whole push would 400, books included. The newest
	// rows go first; an older row past the cap that never reached the server is
	// not sent (needs a push watermark to fix).
	return {
		collections: newestFirst(collections).slice(0, COLLECTIONS_PUSH_MAX),
		collectionBooks: newestFirst(collectionBooks).slice(0, COLLECTION_BOOKS_PUSH_MAX),
		rejected,
	};
}

function newestFirst<T extends { updatedAt: number }>(rows: T[]): T[] {
	return rows.length > 1 ? [...rows].sort((a, b) => b.updatedAt - a.updatedAt) : rows;
}

function memberKey(collectionId: string, bookId: string): string {
	return `${collectionId}\u0000${bookId}`;
}
