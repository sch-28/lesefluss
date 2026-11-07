// @vitest-environment node
import type { SQLInputValue } from "node:sqlite";
import { seriesCollectionId } from "@lesefluss/core";
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

	it("numbers a never-ordered collection by when each book joined it, oldest first", async () => {
		const c = await collections.createCollectionWithBooks("Shelf", ["aaaaaaaa"], {}, 30);
		await collections.addBooksToCollection(c.id, ["cccccccc"], 10);
		await collections.addBooksToCollection(c.id, ["bbbbbbbb"], 20);
		await collections.editCollection(c.id, { ordered: true }, 40);
		const members = await collections.getCollectionMembers(c.id);
		expect(members.map((m) => [m.bookId, m.seriesIndex])).toEqual([
			["cccccccc", 1],
			["bbbbbbbb", 2],
			["aaaaaaaa", 3],
		]);
	});

	it("numbers a member picked again by when it first joined, not by the repeat add", async () => {
		const c = await collections.createCollectionWithBooks("Shelf", ["bbbbbbbb"], {}, 10);
		await collections.addBooksToCollection(c.id, ["aaaaaaaa"], 20);
		await collections.addBooksToCollection(c.id, ["bbbbbbbb", "cccccccc"], 30);
		await collections.editCollection(c.id, { ordered: true }, 40);
		const members = await collections.getCollectionMembers(c.id);
		expect(members.map((m) => [m.bookId, m.seriesIndex])).toEqual([
			["bbbbbbbb", 1],
			["aaaaaaaa", 2],
			["cccccccc", 3],
		]);
	});

	it("keeps existing numbers and numbers the rest after them when Keep in order comes back on", async () => {
		insertBook("dddddddd");
		const c = await collections.createCollectionWithBooks(
			"Saga",
			["aaaaaaaa", "bbbbbbbb"],
			{ ordered: true },
			1,
		);
		await collections.addBooksToCollection(c.id, ["bbbbbbbb"], 2, new Map([["bbbbbbbb", 2.5]]));
		await collections.editCollection(c.id, { ordered: false }, 3);
		await collections.addBooksToCollection(c.id, ["dddddddd"], 4);
		await collections.addBooksToCollection(c.id, ["cccccccc"], 5);
		await collections.editCollection(c.id, { ordered: true }, 6);
		const members = await collections.getCollectionMembers(c.id);
		expect(members.map((m) => [m.bookId, m.seriesIndex])).toEqual([
			["aaaaaaaa", 1],
			["bbbbbbbb", 2.5],
			["dddddddd", 3],
			["cccccccc", 4],
		]);
	});

	it("numbers books that joined together by title when Keep in order is switched on", async () => {
		const c = await collections.createCollectionWithBooks(
			"Shelf",
			["cccccccc", "aaaaaaaa", "bbbbbbbb"],
			{},
			1,
		);
		await collections.editCollection(c.id, { ordered: true, add: [] }, 2);
		const members = await collections.getCollectionMembers(c.id);
		expect(members.map((m) => [m.bookId, m.seriesIndex])).toEqual([
			["aaaaaaaa", 1],
			["bbbbbbbb", 2],
			["cccccccc", 3],
		]);
	});

	it("numbers members first, then the books added in the same save", async () => {
		insertBook("dddddddd");
		const c = await collections.createCollectionWithBooks("Shelf", ["bbbbbbbb", "aaaaaaaa"], {}, 1);
		await collections.editCollection(
			c.id,
			{ ordered: true, remove: ["bbbbbbbb"], add: ["dddddddd", "cccccccc"] },
			2,
		);
		const members = await collections.getCollectionMembers(c.id);
		expect(members.map((m) => [m.bookId, m.seriesIndex])).toEqual([
			["aaaaaaaa", 1],
			["dddddddd", 2],
			["cccccccc", 3],
		]);
	});

	it("keeps the numbers of an already ordered collection when its name changes", async () => {
		const c = await collections.createCollectionWithBooks(
			"Saga",
			["bbbbbbbb", "aaaaaaaa"],
			{ ordered: true },
			1,
		);
		await collections.editCollection(c.id, { name: "Saga II", ordered: true }, 2);
		const members = await collections.getCollectionMembers(c.id);
		expect(members.map((m) => [m.bookId, m.seriesIndex])).toEqual([
			["bbbbbbbb", 1],
			["aaaaaaaa", 2],
		]);
	});

	it("appends an import to an ordered collection with the next #N, and a member keeps its own", async () => {
		const plain = await collections.createCollectionWithBooks("Plain", ["aaaaaaaa"], {}, 1);
		await collections.appendBooksToCollection(plain.id, ["bbbbbbbb"], 2);
		expect((await collections.getCollectionMembers(plain.id)).map((m) => m.seriesIndex)).toEqual([
			null,
			null,
		]);

		const saga = await collections.createCollectionWithBooks(
			"Saga",
			["aaaaaaaa"],
			{ ordered: true },
			3,
		);
		await collections.addBooksToCollection(saga.id, ["bbbbbbbb"], 4, new Map([["bbbbbbbb", 2.5]]));
		await collections.appendBooksToCollection(saga.id, ["cccccccc", "bbbbbbbb"], 5);
		const members = await collections.getCollectionMembers(saga.id);
		expect(members.map((m) => [m.bookId, m.seriesIndex])).toEqual([
			["aaaaaaaa", 1],
			["bbbbbbbb", 2.5],
			["cccccccc", 3],
		]);
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

describe("series collections from the collection sheet", () => {
	it("creates a real series: the derived id, a series key, ordered, last in the sidebar", async () => {
		await collections.createCollection("Shelf", 1);
		const s = await collections.createSeriesCollection("  The Expanse ", 2);
		expect(s).toMatchObject({
			id: seriesCollectionId("the expanse"),
			name: "The Expanse",
			seriesKey: "the expanse",
			ordered: true,
		});
		expect(await names()).toEqual(["Shelf", "The Expanse"]);
		await expect(collections.createSeriesCollection("  !! ", 3)).rejects.toThrow();
	});

	it("returns a live series as it is instead of renaming it", async () => {
		const first = await collections.createSeriesCollection("Dune", 1);
		const again = await collections.createSeriesCollection("DUNE", 2);
		expect(again).toMatchObject({ id: first.id, name: "Dune", updatedAt: 1 });
	});

	it("brings back a deleted series, its old members still dismissed", async () => {
		const s = await collections.createSeriesCollection("Dune", 1);
		await collections.addBooksToCollection(s.id, ["aaaaaaaa"], 2);
		await collections.deleteCollection(s.id, 3);
		const back = await collections.createSeriesCollection("Dune", 4);
		expect(back.id).toBe(s.id);
		expect(await names()).toEqual(["Dune"]);
		expect(await collections.getCollectionBookIds(s.id)).toEqual([]);
	});

	it("maps books to their series collections with #N, in sidebar order, leaving plain ones out", async () => {
		const plain = await collections.createCollection("Ordered by hand", 1);
		raw.prepare("UPDATE collections SET ordered = 1 WHERE id = ?").run(plain.id);
		const dune = await collections.createSeriesCollection("Dune", 2);
		const expanse = await collections.createSeriesCollection("Expanse", 3);
		await collections.addBooksToCollection(plain.id, ["aaaaaaaa"], 4, new Map([["aaaaaaaa", 7]]));
		await collections.addBooksToCollection(expanse.id, ["aaaaaaaa"], 5);
		await collections.addBooksToCollection(
			dune.id,
			["aaaaaaaa", "bbbbbbbb"],
			6,
			new Map([
				["aaaaaaaa", 2.5],
				["bbbbbbbb", 1],
			]),
		);
		await deleteBook("bbbbbbbb");
		const byBook = await collections.getSeriesMemberships();
		expect(byBook.get("aaaaaaaa")).toEqual([
			{ collectionId: dune.id, seriesIndex: 2.5 },
			{ collectionId: expanse.id, seriesIndex: null },
		]);
		expect(byBook.has("bbbbbbbb")).toBe(false);
	});

	it("adding a book to a series takes it out of its other series, dismissed there", async () => {
		const plain = await collections.createCollection("Shelf", 1);
		const dune = await collections.createSeriesCollection("Dune", 2);
		const expanse = await collections.createSeriesCollection("Expanse", 3);
		await collections.addBooksToCollection(plain.id, ["aaaaaaaa"], 4);
		await collections.addBooksToCollection(dune.id, ["aaaaaaaa", "bbbbbbbb"], 5);
		await collections.appendBooksToCollection(expanse.id, ["aaaaaaaa"], 6);
		expect(await collections.getCollectionBookIds(dune.id)).toEqual(["bbbbbbbb"]);
		expect(await collections.getCollectionBookIds(expanse.id)).toEqual(["aaaaaaaa"]);
		expect(await collections.getCollectionBookIds(plain.id)).toEqual(["aaaaaaaa"]);
		const tomb = raw
			.prepare(
				"SELECT deleted, updated_at FROM collection_books WHERE collection_id = ? AND book_id = ?",
			)
			.get(dune.id, "aaaaaaaa");
		expect(tomb).toEqual({ deleted: 1, updated_at: 6 });
	});

	it("reorders an ordered collection: each changed row gets its new #N", async () => {
		const saga = await collections.createSeriesCollection("Saga", 1);
		await collections.appendBooksToCollection(saga.id, ["aaaaaaaa", "bbbbbbbb", "cccccccc"], 2);
		await collections.setMembershipOrder(saga.id, [
			{ bookId: "cccccccc", seriesIndex: 1, position: null },
			{ bookId: "aaaaaaaa", seriesIndex: 2, position: null },
			{ bookId: "bbbbbbbb", seriesIndex: 3, position: null },
		]);
		expect(
			(await collections.getCollectionMembers(saga.id)).map((m) => [m.bookId, m.seriesIndex]),
		).toEqual([
			["cccccccc", 1],
			["aaaaaaaa", 2],
			["bbbbbbbb", 3],
		]);
	});
});
