// @vitest-environment node
import type { SQLInputValue } from "node:sqlite";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "./test-db";

const { db, raw, close } = createTestDb();
vi.mock("../index", () => ({
	get db() {
		return db;
	},
}));
afterAll(close);

const collections = await import("../queries/collections");
const { deleteBook, hardDeleteBook } = await import("../queries/books");

function insertBook(id: string, overrides: Record<string, SQLInputValue> = {}) {
	const row: Record<string, SQLInputValue> = {
		id,
		title: id,
		file_format: "epub",
		size: 1,
		word_position: 0,
		word_count: 1000,
		is_active: 0,
		added_at: 0,
		deleted: 0,
		...overrides,
	};
	const keys = Object.keys(row);
	raw
		.prepare(`INSERT INTO books (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`)
		.run(...Object.values(row));
}

async function names() {
	return (await collections.getCollections()).map((c) => c.name);
}

async function count(id: string) {
	return (await collections.getCollections()).find((c) => c.id === id)?.bookCount;
}

beforeEach(() => {
	raw.exec("DELETE FROM collections; DELETE FROM collection_books; DELETE FROM books;");
	insertBook("aaaaaaaa");
	insertBook("bbbbbbbb");
	insertBook("cccccccc");
});

describe("collections", () => {
	it("creates collections in order and trims the name", async () => {
		await collections.createCollection("  To read  ", 1);
		await collections.createCollection("Favourites", 2);
		expect(await names()).toEqual(["To read", "Favourites"]);
		await expect(collections.createCollection("   ", 3)).rejects.toThrow();
	});

	it("renames and reorders", async () => {
		const a = await collections.createCollection("A", 1);
		await collections.createCollection("B", 2);
		const c = await collections.createCollection("C", 3);
		await collections.renameCollection(a.id, "First", 4);
		await collections.moveCollection(c.id, 0, 5);
		expect(await names()).toEqual(["C", "First", "B"]);
		await collections.moveCollection(c.id, 2, 6);
		expect(await names()).toEqual(["First", "B", "C"]);
		await collections.moveCollection(c.id, 1, 7);
		expect(await names()).toEqual(["First", "C", "B"]);
	});

	it("keeps a distinct order after many moves into the same gap", async () => {
		await collections.createCollection("A", 1);
		const b = await collections.createCollection("B", 2);
		const c = await collections.createCollection("C", 3);
		for (let i = 0; i < 60; i++) {
			await collections.moveCollection(i % 2 ? b.id : c.id, 1, 10 + i);
		}
		const orders = (await collections.getCollections()).map((x) => x.sortOrder);
		expect(new Set(orders).size).toBe(3);
		expect(await names()).toEqual(["A", "B", "C"]);
	});

	it("adds and removes books, and counts them", async () => {
		const c = await collections.createCollection("Shelf", 1);
		await collections.addBooksToCollection(c.id, ["aaaaaaaa", "bbbbbbbb", "aaaaaaaa"], 2);
		expect(await count(c.id)).toBe(2);
		expect((await collections.getCollectionBookIds(c.id)).sort()).toEqual(["aaaaaaaa", "bbbbbbbb"]);
		expect(await collections.getCollectionIdsForBook("aaaaaaaa")).toEqual([c.id]);
		await collections.removeBooksFromCollection(c.id, ["aaaaaaaa"], 3);
		expect(await collections.getCollectionBookIds(c.id)).toEqual(["bbbbbbbb"]);
		expect(await collections.getCollectionIdsForBook("aaaaaaaa")).toEqual([]);
		await collections.addBooksToCollection(c.id, ["aaaaaaaa"], 4);
		expect(await count(c.id)).toBe(2);
	});

	it("creates a collection with its picked books, numbered in pick order when ordered", async () => {
		const plain = await collections.createCollectionWithBooks(
			"Plain",
			["bbbbbbbb", "aaaaaaaa"],
			{},
			1,
		);
		expect(plain.ordered).toBe(false);
		expect((await collections.getCollectionBookIds(plain.id)).sort()).toEqual([
			"aaaaaaaa",
			"bbbbbbbb",
		]);
		expect((await collections.getCollectionMembers(plain.id)).map((m) => m.seriesIndex)).toEqual([
			null,
			null,
		]);

		const ordered = await collections.createCollectionWithBooks(
			"Saga",
			["cccccccc", "aaaaaaaa"],
			{ ordered: true },
			2,
		);
		expect((await collections.getCollections()).find((c) => c.id === ordered.id)?.ordered).toBe(
			true,
		);
		const members = await collections.getCollectionMembers(ordered.id);
		expect(members.map((m) => [m.bookId, m.seriesIndex])).toEqual([
			["cccccccc", 1],
			["aaaaaaaa", 2],
		]);
	});

	it("creates an empty collection when nothing is picked", async () => {
		const c = await collections.createCollectionWithBooks("Empty", [], {}, 1);
		expect(await count(c.id)).toBe(0);
		await expect(collections.createCollectionWithBooks(" ", ["aaaaaaaa"], {}, 2)).rejects.toThrow();
		expect(await names()).toEqual(["Empty"]);
	});

	it("edits name, order and members in one save, numbering additions after the last #N", async () => {
		const c = await collections.createCollectionWithBooks(
			"Saga",
			["aaaaaaaa", "bbbbbbbb"],
			{ ordered: true },
			1,
		);
		await collections.editCollection(
			c.id,
			{ name: " Saga II ", remove: ["aaaaaaaa"], add: ["cccccccc"] },
			2,
		);
		expect(await names()).toEqual(["Saga II"]);
		const members = await collections.getCollectionMembers(c.id);
		expect(members.map((m) => [m.bookId, m.seriesIndex])).toEqual([
			["bbbbbbbb", 2],
			["cccccccc", 3],
		]);

		await collections.editCollection(c.id, { ordered: false, add: ["aaaaaaaa"] }, 3);
		const after = await collections.getCollections();
		expect(after[0]?.ordered).toBe(false);
		expect(after[0]?.bookCount).toBe(3);
	});

	it("renaming a series collection keeps its series key", async () => {
		const c = await collections.createCollection("Dune", 1);
		raw.prepare("UPDATE collections SET series_key = ? WHERE id = ?").run("dune", c.id);
		await collections.editCollection(c.id, { name: "Dune saga" }, 2);
		const row = (await collections.getCollections()).find((x) => x.id === c.id);
		expect(row?.name).toBe("Dune saga");
		expect(row?.seriesKey).toBe("dune");
	});

	it("drops a deleted book from counts and members, tombstoned and then hard-deleted", async () => {
		const c = await collections.createCollection("Shelf", 1);
		await collections.addBooksToCollection(c.id, ["aaaaaaaa", "bbbbbbbb"], 2);
		await deleteBook("aaaaaaaa");
		expect(await count(c.id)).toBe(1);
		expect(await collections.getCollectionBookIds(c.id)).toEqual(["bbbbbbbb"]);
		await hardDeleteBook("aaaaaaaa");
		expect(await count(c.id)).toBe(1);
		expect(await collections.getCollectionBookIds(c.id)).toEqual(["bbbbbbbb"]);
	});

	it("maps each live book to its live collections", async () => {
		const a = await collections.createCollection("A", 1);
		const b = await collections.createCollection("B", 2);
		const gone = await collections.createCollection("Gone", 3);
		await collections.addBooksToCollection(a.id, ["aaaaaaaa", "bbbbbbbb"], 4);
		await collections.addBooksToCollection(b.id, ["aaaaaaaa", "cccccccc"], 5);
		await collections.addBooksToCollection(gone.id, ["bbbbbbbb"], 6);
		await collections.deleteCollection(gone.id, 7);
		await deleteBook("cccccccc");
		const byBook = await collections.getCollectionMemberships();
		expect(byBook.get("aaaaaaaa")?.sort()).toEqual([a.id, b.id].sort());
		expect(byBook.get("bbbbbbbb")).toEqual([a.id]);
		expect(byBook.has("cccccccc")).toBe(false);
	});

	it("deleting a collection tombstones it and its memberships but keeps the books", async () => {
		const c = await collections.createCollection("Shelf", 1);
		await collections.addBooksToCollection(c.id, ["aaaaaaaa"], 2);
		await collections.deleteCollection(c.id, 3);
		expect(await names()).toEqual([]);
		expect(await collections.getCollectionIdsForBook("aaaaaaaa")).toEqual([]);
		const bookRows = raw.prepare("SELECT id FROM books WHERE deleted = 0").all();
		expect(bookRows).toHaveLength(3);
		const synced = await collections.getAllCollectionBooksForSync();
		expect(synced).toEqual([
			{
				collectionId: c.id,
				bookId: "aaaaaaaa",
				seriesIndex: null,
				position: null,
				deleted: true,
				updatedAt: 3,
			},
		]);
		expect((await collections.getAllCollectionsForSync())[0]).toMatchObject({ deleted: true });
	});

	it("an upsert from sync only lands when it is newer", async () => {
		const c = await collections.createCollection("Mine", 5);
		await collections.upsertCollections([{ ...c, name: "Older", updatedAt: 4 }]);
		expect(await names()).toEqual(["Mine"]);
		await collections.upsertCollections([{ ...c, name: "Newer", updatedAt: 6 }]);
		expect(await names()).toEqual(["Newer"]);

		await collections.addBooksToCollection(c.id, ["aaaaaaaa"], 10);
		await collections.upsertCollectionBooks([
			{
				collectionId: c.id,
				bookId: "aaaaaaaa",
				seriesIndex: null,
				position: null,
				deleted: true,
				updatedAt: 9,
			},
		]);
		expect(await count(c.id)).toBe(1);
		await collections.upsertCollectionBooks([
			{
				collectionId: c.id,
				bookId: "aaaaaaaa",
				seriesIndex: null,
				position: null,
				deleted: true,
				updatedAt: 11,
			},
			{
				collectionId: c.id,
				bookId: "bbbbbbbb",
				seriesIndex: null,
				position: null,
				deleted: false,
				updatedAt: 11,
			},
		]);
		expect(await collections.getCollectionBookIds(c.id)).toEqual(["bbbbbbbb"]);
	});
});
