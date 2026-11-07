import { COLLECTIONS_PUSH_MAX, SyncPayloadSchema } from "@lesefluss/core";
import { describe, expect, it } from "vitest";
import type { Collection, CollectionBook } from "../../db/schema";
import { buildCollectionMerge, pushableCollections } from "../collection-sync";

function collection(overrides: Partial<Collection> = {}): Collection {
	return {
		id: "c1",
		name: "Shelf",
		sortOrder: 1,
		ordered: false,
		seriesKey: null,
		deleted: false,
		createdAt: 1_000,
		updatedAt: 1_000,
		...overrides,
	};
}

function member(bookId: string, overrides: Partial<CollectionBook> = {}): CollectionBook {
	return {
		collectionId: "c1",
		bookId,
		seriesIndex: null,
		position: null,
		deleted: false,
		updatedAt: 1_000,
		...overrides,
	};
}

const syncCollection = (c: Collection) => ({
	collectionId: c.id,
	name: c.name,
	sortOrder: c.sortOrder,
	deleted: c.deleted,
	createdAt: c.createdAt,
	updatedAt: c.updatedAt,
});

describe("collection sync payload", () => {
	it("a payload from a client without collections parses and leaves the arrays out", () => {
		const parsed = SyncPayloadSchema.parse({ books: [], settings: null, highlights: [] });
		expect(parsed.collections).toBeUndefined();
		expect(parsed.collectionBooks).toBeUndefined();
	});

	it("a pushed payload survives validation and merges back unchanged", () => {
		const local = { collections: [collection()], collectionBooks: [member("aaaaaaaa")] };
		const pushed = pushableCollections(local);
		const payload = SyncPayloadSchema.parse({
			books: [],
			settings: null,
			highlights: [],
			...pushed,
		});
		const merge = buildCollectionMerge(
			{ collections: [], collectionBooks: [] },
			{ collections: payload.collections ?? [], collectionBooks: payload.collectionBooks ?? [] },
		);
		expect(merge.collections).toEqual(local.collections);
		expect(merge.collectionBooks).toEqual(local.collectionBooks);
	});

	it("drops rows that would fail the server's validation", () => {
		const pushed = pushableCollections({
			collections: [collection(), collection({ id: "c2", name: " " })],
			collectionBooks: [member("aaaaaaaa"), member("not-hex")],
		});
		expect(pushed.collections.map((c) => c.collectionId)).toEqual(["c1"]);
		expect(pushed.collectionBooks.map((m) => m.bookId)).toEqual(["aaaaaaaa"]);
		expect(pushed.rejected).toBe(2);
	});

	it("stays under the server's cap once tombstones pile up, newest rows first", () => {
		const many = Array.from({ length: COLLECTIONS_PUSH_MAX + 5 }, (_, i) =>
			collection({ id: `c${i}`, deleted: i > 0, updatedAt: 1_000 + i }),
		);
		const pushed = pushableCollections({ collections: many, collectionBooks: [] });
		expect(pushed.collections).toHaveLength(COLLECTIONS_PUSH_MAX);
		expect(pushed.collections[0]?.collectionId).toBe(`c${COLLECTIONS_PUSH_MAX + 4}`);
		expect(() =>
			SyncPayloadSchema.parse({ books: [], settings: null, highlights: [], ...pushed }),
		).not.toThrow();
	});
});

describe("collection pull merge", () => {
	it("takes only rows newer than the local copy, tombstones included", () => {
		const merge = buildCollectionMerge(
			{
				collections: [collection({ updatedAt: 2_000 })],
				collectionBooks: [member("aaaaaaaa", { updatedAt: 2_000 })],
			},
			{
				collections: [
					syncCollection(collection({ name: "Older", updatedAt: 1_500 })),
					syncCollection(collection({ id: "c2", deleted: true, updatedAt: 1_000 })),
				],
				collectionBooks: [
					member("aaaaaaaa", { deleted: true, updatedAt: 2_000 }),
					member("bbbbbbbb", { updatedAt: 1_000 }),
					member("aaaaaaaa", { collectionId: "c2", deleted: true, updatedAt: 3_000 }),
				],
			},
		);
		expect(merge.collections.map((c) => c.id)).toEqual(["c2"]);
		expect(merge.collectionBooks).toEqual([
			member("bbbbbbbb"),
			member("aaaaaaaa", { collectionId: "c2", deleted: true, updatedAt: 3_000 }),
		]);
	});

	it("a book added here and another added elsewhere both stay", () => {
		const merge = buildCollectionMerge(
			{ collections: [collection()], collectionBooks: [member("aaaaaaaa", { updatedAt: 5_000 })] },
			{ collections: [], collectionBooks: [member("bbbbbbbb", { updatedAt: 5_100 })] },
		);
		expect(merge.collectionBooks).toEqual([member("bbbbbbbb", { updatedAt: 5_100 })]);
	});

	it("skips malformed rows instead of failing the pull", () => {
		const merge = buildCollectionMerge(
			{ collections: [], collectionBooks: [] },
			{ collections: [{ collectionId: "c1" }], collectionBooks: [null] },
		);
		expect(merge).toEqual({ collections: [], collectionBooks: [], rejected: 2 });
	});

	it("a row from the server without the series fields keeps the local values", () => {
		const merge = buildCollectionMerge(
			{
				collections: [collection({ ordered: true, seriesKey: "dune" })],
				collectionBooks: [member("aaaaaaaa", { seriesIndex: 2, position: 4 })],
			},
			{
				collections: [syncCollection(collection({ name: "Renamed", updatedAt: 2_000 }))],
				collectionBooks: [
					{ collectionId: "c1", bookId: "aaaaaaaa", deleted: false, updatedAt: 2_000 },
					{ collectionId: "c1", bookId: "bbbbbbbb", deleted: false, updatedAt: 2_000 },
				],
			},
		);
		expect(merge.collections).toEqual([
			collection({ name: "Renamed", ordered: true, seriesKey: "dune", updatedAt: 2_000 }),
		]);
		expect(merge.collectionBooks).toEqual([
			member("aaaaaaaa", { seriesIndex: 2, position: 4, updatedAt: 2_000 }),
			member("bbbbbbbb", { updatedAt: 2_000 }),
		]);
	});

	it("series fields round-trip through push and pull, nulls included", () => {
		const local = {
			collections: [
				collection({ id: "series-0011223344556677", ordered: true, seriesKey: "dune" }),
			],
			collectionBooks: [
				member("aaaaaaaa", { collectionId: "series-0011223344556677", seriesIndex: 2.5 }),
				member("bbbbbbbb", { collectionId: "series-0011223344556677", position: -1 }),
			],
		};
		const payload = SyncPayloadSchema.parse({
			books: [],
			settings: null,
			highlights: [],
			...pushableCollections(local),
		});
		const merge = buildCollectionMerge(
			{
				collections: [collection({ id: "series-0011223344556677", ordered: false, updatedAt: 1 })],
				collectionBooks: [],
			},
			{ collections: payload.collections ?? [], collectionBooks: payload.collectionBooks ?? [] },
		);
		expect(merge.collections).toEqual(local.collections);
		expect(merge.collectionBooks).toEqual(local.collectionBooks);
	});
});
