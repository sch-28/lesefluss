import {
	COLLECTION_NAME_MAX,
	normalizeSeriesKey,
	SERIES_ID_PREFIX,
	seriesCollectionId,
} from "@lesefluss/core";
import { and, asc, eq, inArray, isNotNull, isNull, like, sql } from "drizzle-orm";
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

// 8 bound columns per collection row stays under SQLite's 999 parameters.
const CHUNK_SIZE = 100;
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
	const bookCount =
		sql<number>`(SELECT count(*) FROM ${collectionBooks} WHERE ${collectionBooks.collectionId} = ${collections.id} AND ${liveMember})`.as(
			"book_count",
		);
	const rows = await db
		.select({
			id: collections.id,
			name: collections.name,
			sortOrder: collections.sortOrder,
			ordered: collections.ordered,
			seriesKey: collections.seriesKey,
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
		ordered: false,
		seriesKey: null,
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

export async function setCollectionOrdered(
	id: string,
	ordered: boolean,
	now = serverNow(),
): Promise<void> {
	await db.update(collections).set({ ordered, updatedAt: now }).where(eq(collections.id, id));
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

/**
 * Adds books, or brings back removed ones. `seriesIndex` (book id → #N) is
 * written only for the books it names; a re-added book keeps its old number otherwise.
 */
export async function addBooksToCollection(
	collectionId: string,
	bookIds: string[],
	now = serverNow(),
	seriesIndex?: ReadonlyMap<string, number | null>,
): Promise<void> {
	const unique = [...new Set(bookIds)];
	const numbered = unique.filter((id) => seriesIndex?.has(id));
	const plain = unique.filter((id) => !seriesIndex?.has(id));
	for (let i = 0; i < plain.length; i += CHUNK_SIZE) {
		await db
			.insert(collectionBooks)
			.values(
				plain
					.slice(i, i + CHUNK_SIZE)
					.map((bookId) => ({ collectionId, bookId, deleted: false, updatedAt: now })),
			)
			.onConflictDoUpdate({
				target: [collectionBooks.collectionId, collectionBooks.bookId],
				set: { deleted: false, updatedAt: now },
			});
	}
	for (let i = 0; i < numbered.length; i += CHUNK_SIZE) {
		await db
			.insert(collectionBooks)
			.values(
				numbered.slice(i, i + CHUNK_SIZE).map((bookId) => ({
					collectionId,
					bookId,
					seriesIndex: seriesIndex?.get(bookId) ?? null,
					deleted: false,
					updatedAt: now,
				})),
			)
			.onConflictDoUpdate({
				target: [collectionBooks.collectionId, collectionBooks.bookId],
				set: { seriesIndex: sql`excluded.series_index`, deleted: false, updatedAt: now },
			});
	}
}

export interface MembershipOrder {
	bookId: string;
	seriesIndex: number | null;
	position: number | null;
}

/** Writes #N and manual positions of a collection's members. */
export async function setMembershipOrder(
	collectionId: string,
	order: MembershipOrder[],
	now = serverNow(),
): Promise<void> {
	for (const { bookId, seriesIndex, position } of order) {
		await db
			.update(collectionBooks)
			.set({ seriesIndex, position, updatedAt: now })
			.where(
				and(eq(collectionBooks.collectionId, collectionId), eq(collectionBooks.bookId, bookId)),
			);
	}
}

/** Live members in reading order: #N, then manual position, then title; unset values last. */
export async function getCollectionMembers(collectionId: string): Promise<CollectionBook[]> {
	return db
		.select({
			collectionId: collectionBooks.collectionId,
			bookId: collectionBooks.bookId,
			seriesIndex: collectionBooks.seriesIndex,
			position: collectionBooks.position,
			deleted: collectionBooks.deleted,
			updatedAt: collectionBooks.updatedAt,
		})
		.from(collectionBooks)
		.innerJoin(books, eq(books.id, collectionBooks.bookId))
		.where(and(eq(collectionBooks.collectionId, collectionId), liveMember))
		.orderBy(
			sql`${collectionBooks.seriesIndex} IS NULL`,
			asc(collectionBooks.seriesIndex),
			sql`${collectionBooks.position} IS NULL`,
			asc(collectionBooks.position),
			asc(books.title),
			asc(books.id),
		);
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

/** #1..#N in the order given, starting after `from`. */
function numberInOrder(bookIds: readonly string[], from: number): Map<string, number> {
	return new Map([...new Set(bookIds)].map((id, i) => [id, from + i + 1]));
}

async function highestSeriesIndex(collectionId: string): Promise<number> {
	const [row] = await db
		.select({ max: sql<number | null>`max(${collectionBooks.seriesIndex})`.as("max_index") })
		.from(collectionBooks)
		.where(and(eq(collectionBooks.collectionId, collectionId), liveMember));
	return Number(row?.max ?? 0);
}

/**
 * A new collection holding `bookIds`; an ordered one numbers them in the order
 * given. The adapter commits each statement on its own, so a failure part way
 * leaves the collection with the books written so far.
 */
export async function createCollectionWithBooks(
	name: string,
	bookIds: readonly string[],
	options: { ordered?: boolean } = {},
	now = serverNow(),
): Promise<Collection> {
	const ordered = options.ordered ?? false;
	const row = await createCollection(name, now);
	if (ordered) await setCollectionOrdered(row.id, true, now);
	if (bookIds.length > 0) {
		await addBooksToCollection(
			row.id,
			[...bookIds],
			now,
			ordered ? numberInOrder(bookIds, 0) : undefined,
		);
	}
	return { ...row, ordered };
}

export type CollectionEdit = {
	name?: string;
	ordered?: boolean;
	add?: readonly string[];
	remove?: readonly string[];
};

/**
 * One save of the collection page. Books added to an ordered collection are
 * numbered after its last #N, in the order given; renaming leaves a series
 * collection's `seriesKey` alone.
 */
export async function editCollection(
	id: string,
	edit: CollectionEdit,
	now = serverNow(),
): Promise<void> {
	if (edit.name !== undefined) await renameCollection(id, edit.name, now);
	if (edit.ordered !== undefined) await setCollectionOrdered(id, edit.ordered, now);
	if (edit.remove?.length) await removeBooksFromCollection(id, [...edit.remove], now);
	if (edit.add?.length) {
		const [collection] = await db
			.select({ ordered: collections.ordered })
			.from(collections)
			.where(eq(collections.id, id));
		const numbered = collection?.ordered
			? numberInOrder(edit.add, await highestSeriesIndex(id))
			: undefined;
		await addBooksToCollection(id, [...edit.add], now, numbered);
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

/**
 * The book's place in its series: the first live ordered collection holding it,
 * a series-imported one before a hand-made one.
 */
export async function getSeriesMembershipForBook(
	bookId: string,
): Promise<{ collectionId: string; seriesIndex: number | null } | null> {
	const [row] = await db
		.select({
			collectionId: collectionBooks.collectionId,
			seriesIndex: collectionBooks.seriesIndex,
		})
		.from(collectionBooks)
		.innerJoin(collections, eq(collections.id, collectionBooks.collectionId))
		.where(
			and(
				eq(collectionBooks.bookId, bookId),
				eq(collectionBooks.deleted, false),
				eq(collections.deleted, false),
				eq(collections.ordered, true),
			),
		)
		.orderBy(sql`${collections.seriesKey} IS NULL`, asc(collections.sortOrder))
		.limit(1);
	return row ?? null;
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

/** Live, non-chapter books that carry a series hint. */
export async function getSeriesHintBooks() {
	return db
		.select({
			id: books.id,
			title: books.title,
			addedAt: books.addedAt,
			seriesName: books.seriesName,
			seriesIndex: books.seriesIndex,
		})
		.from(books)
		.where(and(eq(books.deleted, false), isNull(books.seriesId), isNotNull(books.seriesName)));
}

/** Every series collection row and its memberships, tombstones included: they are the dismissals. */
export async function getSeriesReconcileRows(): Promise<{
	collections: Collection[];
	memberships: CollectionBook[];
}> {
	const seriesRows = like(collections.id, `${SERIES_ID_PREFIX}%`);
	return {
		collections: await db.select().from(collections).where(seriesRows),
		memberships: await db
			.select()
			.from(collectionBooks)
			.where(like(collectionBooks.collectionId, `${SERIES_ID_PREFIX}%`)),
	};
}

export type ImportSeriesState = {
	/** The series collection the key derives, tombstoned or not; null before it formed. */
	collection: { id: string; name: string; deleted: boolean; bookCount: number } | null;
	/** Live books with the key that were not taken out of it, oldest first. */
	others: { id: string; title: string }[];
};

/** What an import whose file names this series key would join. */
export async function getImportSeriesState(seriesKey: string): Promise<ImportSeriesState> {
	const id = seriesCollectionId(seriesKey);
	const [row] = await db.select().from(collections).where(eq(collections.id, id));
	const memberships = await db
		.select({ bookId: collectionBooks.bookId, deleted: collectionBooks.deleted })
		.from(collectionBooks)
		.where(eq(collectionBooks.collectionId, id));
	const dismissed = new Set(memberships.filter((m) => m.deleted).map((m) => m.bookId));
	const others = (await getSeriesHintBooks())
		.filter((b) => normalizeSeriesKey(b.seriesName) === seriesKey && !dismissed.has(b.id))
		.sort((a, b) => a.addedAt - b.addedAt || a.id.localeCompare(b.id))
		.map((b) => ({ id: b.id, title: b.title }));
	if (!row) return { collection: null, others };
	const [count] = await db
		.select({ n: sql<number>`count(*)`.as("n") })
		.from(collectionBooks)
		.where(and(eq(collectionBooks.collectionId, id), liveMember));
	return {
		collection: { id, name: row.name, deleted: row.deleted, bookCount: Number(count?.n ?? 0) },
		others,
	};
}

/**
 * Keeps a book out of a collection for good: a tombstoned membership, written
 * even when the collection does not exist yet, which is what the series
 * reconcile here and on every other device reads as a dismissal.
 */
export async function dismissBookFromCollection(
	collectionId: string,
	bookId: string,
	now = serverNow(),
): Promise<void> {
	await db
		.insert(collectionBooks)
		.values({ collectionId, bookId, deleted: true, updatedAt: now })
		.onConflictDoUpdate({
			target: [collectionBooks.collectionId, collectionBooks.bookId],
			set: { deleted: true, updatedAt: now },
		});
}

/** Inserts rows that do not exist yet; an existing row (live or tombstoned) always wins. */
export async function insertMissingCollectionRows(
	newCollections: Collection[],
	newMemberships: CollectionBook[],
): Promise<void> {
	for (let i = 0; i < newCollections.length; i += CHUNK_SIZE) {
		await db
			.insert(collections)
			.values(newCollections.slice(i, i + CHUNK_SIZE))
			.onConflictDoNothing();
	}
	for (let i = 0; i < newMemberships.length; i += CHUNK_SIZE) {
		await db
			.insert(collectionBooks)
			.values(newMemberships.slice(i, i + CHUNK_SIZE))
			.onConflictDoNothing();
	}
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
					ordered: sql`excluded.ordered`,
					seriesKey: sql`excluded.series_key`,
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
				set: {
					seriesIndex: sql`excluded.series_index`,
					position: sql`excluded.position`,
					deleted: sql`excluded.deleted`,
					updatedAt: sql`excluded.updated_at`,
				},
				where: sql`${collectionBooks.updatedAt} < excluded.updated_at`,
			});
	}
}
