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
vi.mock("../../sync", () => ({ scheduleSyncPush: vi.fn() }));
vi.mock("../../query-client", () => ({ queryClient: { invalidateQueries: vi.fn() } }));
afterAll(close);

const collections = await import("../queries/collections");
const { applyBookSeriesPlan, applyImportSeriesChoice, reconcileSeriesCollections } = await import(
	"../../series-collections"
);
const { scheduleSyncPush } = await import("../../sync");

const DUNE = seriesCollectionId("dune");

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

async function seriesRows() {
	return collections.getSeriesReconcileRows();
}

beforeEach(() => {
	raw.exec("DELETE FROM collections; DELETE FROM collection_books; DELETE FROM books;");
	vi.mocked(scheduleSyncPush).mockClear();
});

describe("series reconcile against the database", () => {
	it("turns existing hints into an ordered series collection, once", async () => {
		insertBook("aaaaaaaa", { series_name: "Dune", series_index: 1, added_at: 10 });
		insertBook("bbbbbbbb", { series_name: "DUNE", series_index: 2, added_at: 20 });
		insertBook("cccccccc", { series_name: "Dune", added_at: 30, deleted: 1 });
		insertBook("dddddddd", { series_name: "Dune", added_at: 40, series_id: "serial01" });

		expect(await reconcileSeriesCollections()).toBe(3);
		expect(scheduleSyncPush).toHaveBeenCalledOnce();
		const listed = await collections.getCollections();
		expect(listed).toEqual([
			expect.objectContaining({
				id: DUNE,
				name: "Dune",
				ordered: true,
				seriesKey: "dune",
				view: null,
				bookCount: 2,
			}),
		]);
		const members = await collections.getCollectionMembers(DUNE);
		expect(members.map((m) => [m.bookId, m.seriesIndex])).toEqual([
			["aaaaaaaa", 1],
			["bbbbbbbb", 2],
		]);

		expect(await reconcileSeriesCollections()).toBe(0);
	});

	it("does not re-add a removed book or refill a deleted series", async () => {
		insertBook("aaaaaaaa", { series_name: "Dune", added_at: 10 });
		insertBook("bbbbbbbb", { series_name: "Dune", added_at: 20 });
		await reconcileSeriesCollections();
		await collections.removeBooksFromCollection(DUNE, ["bbbbbbbb"], 1_000);
		expect(await reconcileSeriesCollections()).toBe(0);
		expect(await collections.getCollectionBookIds(DUNE)).toEqual(["aaaaaaaa"]);

		await collections.deleteCollection(DUNE, 2_000);
		insertBook("cccccccc", { series_name: "Dune", added_at: 3_000 });
		expect(await reconcileSeriesCollections()).toBe(0);
		expect((await seriesRows()).collections).toEqual([
			expect.objectContaining({ id: DUNE, deleted: true }),
		]);
	});

	it("leaves rows that arrived by sync in the meantime alone", async () => {
		insertBook("aaaaaaaa", { series_name: "Dune", added_at: 10 });
		insertBook("bbbbbbbb", { series_name: "Dune", added_at: 20 });
		await collections.upsertCollections([
			{
				id: DUNE,
				name: "Renamed elsewhere",
				sortOrder: 1,
				ordered: true,
				seriesKey: "dune",
				view: null,
				deleted: false,
				createdAt: 5,
				updatedAt: 500,
			},
		]);
		await reconcileSeriesCollections();
		expect((await collections.getCollections())[0]?.name).toBe("Renamed elsewhere");
		expect((await collections.getCollectionBookIds(DUNE)).sort()).toEqual(["aaaaaaaa", "bbbbbbbb"]);
	});
});

describe("ordered collection queries", () => {
	it("switches a manual collection to ordered and reads members by number, then manual position", async () => {
		const ids = ["aaaaaaaa", "bbbbbbbb", "cccccccc", "dddddddd"];
		for (const id of ids) insertBook(id);
		const c = await collections.createCollection("Reading order", 1);
		await collections.addBooksToCollection(
			c.id,
			ids,
			2,
			new Map([
				["aaaaaaaa", 2],
				["bbbbbbbb", 1],
			]),
		);
		await collections.setCollectionOrdered(c.id, true, 3);
		expect((await collections.getCollections())[0]).toMatchObject({ ordered: true, updatedAt: 3 });
		expect((await collections.getCollectionMembers(c.id)).map((m) => m.bookId)).toEqual([
			"bbbbbbbb",
			"aaaaaaaa",
			"cccccccc",
			"dddddddd",
		]);

		await collections.setMembershipOrder(
			c.id,
			[
				{ bookId: "dddddddd", seriesIndex: null, position: 1 },
				{ bookId: "cccccccc", seriesIndex: null, position: 2 },
				{ bookId: "aaaaaaaa", seriesIndex: 2, position: 0 },
			],
			4,
		);
		expect((await collections.getCollectionMembers(c.id)).map((m) => m.bookId)).toEqual([
			"bbbbbbbb",
			"aaaaaaaa",
			"dddddddd",
			"cccccccc",
		]);
	});

	it("a hand-made ordered collection is not the book's series", async () => {
		insertBook("aaaaaaaa");
		const c = await collections.createCollection("Reading order", 1);
		await collections.addBooksToCollection(c.id, ["aaaaaaaa"], 2, new Map([["aaaaaaaa", 1]]));
		await collections.setCollectionOrdered(c.id, true, 3);
		expect(await collections.getSeriesMembershipForBook("aaaaaaaa")).toBeNull();

		const dune = await collections.createSeriesCollection("Dune", 4);
		await collections.addBooksToCollection(dune.id, ["aaaaaaaa"], 5, new Map([["aaaaaaaa", 2]]));
		expect(await collections.getSeriesMembershipForBook("aaaaaaaa")).toEqual({
			collectionId: dune.id,
			seriesIndex: 2,
		});
		expect((await collections.getSeriesMemberships()).get("aaaaaaaa")).toEqual([
			{ collectionId: dune.id, seriesIndex: 2 },
		]);
	});

	it("keeps a re-added book's number unless the add names one", async () => {
		insertBook("aaaaaaaa");
		const c = await collections.createCollection("Shelf", 1);
		await collections.addBooksToCollection(c.id, ["aaaaaaaa"], 2, new Map([["aaaaaaaa", 4]]));
		await collections.removeBooksFromCollection(c.id, ["aaaaaaaa"], 3);
		await collections.addBooksToCollection(c.id, ["aaaaaaaa"], 4);
		expect((await collections.getCollectionMembers(c.id))[0]).toMatchObject({
			seriesIndex: 4,
			deleted: false,
		});
	});
});

describe("the Add book page's series choice", () => {
	const hint = { seriesName: "Dune", seriesIndex: 2 };
	const members = async (id: string) =>
		(await collections.getCollectionMembers(id)).map((m) => [m.bookId, m.seriesIndex]);
	const tombstoned = async (bookId: string) =>
		(await seriesRows()).memberships.find((m) => m.collectionId === DUNE && m.bookId === bookId)
			?.deleted;

	it("keeps the file's series: it forms once a second book is in the library", async () => {
		insertBook("aaaaaaaa", { series_name: "Dune", series_index: 1, added_at: 10 });
		await applyImportSeriesChoice(
			"aaaaaaaa",
			{ seriesName: "Dune", seriesIndex: 1 },
			{
				kind: "detected",
				index: 1,
			},
		);
		await reconcileSeriesCollections();
		expect(await collections.getCollections()).toEqual([]);
		expect(await collections.getImportSeriesState("dune")).toEqual({
			collection: null,
			others: [{ id: "aaaaaaaa", title: "aaaaaaaa" }],
		});

		insertBook("bbbbbbbb", { series_name: "Dune", series_index: 2, added_at: 20 });
		await applyImportSeriesChoice("bbbbbbbb", hint, { kind: "detected", index: 2 });
		await reconcileSeriesCollections();
		expect(await members(DUNE)).toEqual([
			["aaaaaaaa", 1],
			["bbbbbbbb", 2],
		]);
		expect(await collections.getImportSeriesState("dune")).toMatchObject({
			collection: { id: DUNE, name: "Dune", deleted: false, bookCount: 2 },
		});
	});

	it("puts the book in the series at the number the reader typed", async () => {
		insertBook("aaaaaaaa", { series_name: "Dune", series_index: 1, added_at: 10 });
		insertBook("bbbbbbbb", { series_name: "Dune", series_index: 2, added_at: 20 });
		await applyImportSeriesChoice("bbbbbbbb", hint, { kind: "detected", index: 5 });
		await reconcileSeriesCollections();
		expect(await members(DUNE)).toEqual([
			["aaaaaaaa", 1],
			["bbbbbbbb", 5],
		]);
	});

	it("No series keeps the book out, also when the series forms later", async () => {
		insertBook("aaaaaaaa", { series_name: "Dune", series_index: 1, added_at: 10 });
		insertBook("bbbbbbbb", { series_name: "Dune", series_index: 2, added_at: 20 });
		await applyImportSeriesChoice("bbbbbbbb", hint, { kind: "none" });
		await reconcileSeriesCollections();
		expect(await collections.getCollections()).toEqual([]);
		expect(await tombstoned("bbbbbbbb")).toBe(true);
		expect((await collections.getImportSeriesState("dune")).others).toEqual([
			{ id: "aaaaaaaa", title: "aaaaaaaa" },
		]);

		insertBook("cccccccc", { series_name: "Dune", series_index: 3, added_at: 30 });
		await reconcileSeriesCollections();
		await reconcileSeriesCollections();
		expect(await collections.getCollectionBookIds(DUNE)).toEqual(["aaaaaaaa", "cccccccc"]);
		expect(await tombstoned("bbbbbbbb")).toBe(true);
	});

	it("another collection takes the book instead of the file's series", async () => {
		const shelf = await collections.createCollection("Favourites", 100);
		insertBook("aaaaaaaa", { series_name: "Dune", series_index: 1, added_at: 10 });
		await reconcileSeriesCollections();
		insertBook("bbbbbbbb", { series_name: "Dune", series_index: 2, added_at: 20 });
		await applyImportSeriesChoice(
			"bbbbbbbb",
			hint,
			{ kind: "collection", collectionId: shelf.id, index: 2 },
			200,
		);
		await reconcileSeriesCollections();
		expect(await members(shelf.id)).toEqual([["bbbbbbbb", null]]);
		expect(await tombstoned("bbbbbbbb")).toBe(true);
		expect(await collections.getCollectionBookIds(DUNE)).toEqual([]);
	});

	it("a new series takes the book at its number", async () => {
		insertBook("bbbbbbbb", { series_name: "Dune", series_index: 2, added_at: 20 });
		await applyImportSeriesChoice("bbbbbbbb", hint, { kind: "new", name: "Dune Saga", index: 7 });
		const created = (await collections.getCollections()).find((c) => c.name === "Dune Saga");
		expect(created).toMatchObject({ ordered: true, seriesKey: "dune saga", bookCount: 1 });
		expect(await members(created?.id ?? "")).toEqual([["bbbbbbbb", 7]]);
		expect(await tombstoned("bbbbbbbb")).toBe(true);
	});

	it("reports a deleted series as such", async () => {
		insertBook("aaaaaaaa", { series_name: "Dune", added_at: 10 });
		insertBook("bbbbbbbb", { series_name: "Dune", added_at: 20 });
		await reconcileSeriesCollections();
		await collections.deleteCollection(DUNE, 1_000);
		expect((await collections.getImportSeriesState("dune")).collection).toMatchObject({
			deleted: true,
			bookCount: 0,
		});
	});
});

describe("the book edit page's series field", () => {
	const DUNE_SAGA = seriesCollectionId("dune saga");
	const inDune = async (bookId: string) =>
		(await seriesRows()).memberships.find((m) => m.collectionId === DUNE && m.bookId === bookId);

	it("a new series is a real series that later imports of that name join", async () => {
		insertBook("aaaaaaaa", { added_at: 10 });
		await applyBookSeriesPlan("aaaaaaaa", {
			remove: null,
			add: { kind: "new", name: "Dune Saga", index: 1 },
		});
		expect((await collections.getCollections()).find((c) => c.id === DUNE_SAGA)).toMatchObject({
			seriesKey: "dune saga",
			ordered: true,
		});

		insertBook("bbbbbbbb", { series_name: "Dune Saga", series_index: 2, added_at: 20 });
		await reconcileSeriesCollections();
		expect(await collections.getCollectionBookIds(DUNE_SAGA)).toEqual(["aaaaaaaa", "bbbbbbbb"]);
	});

	it("keeps the book out of its file series that has not formed yet", async () => {
		insertBook("aaaaaaaa", { series_name: "Dune", series_index: 1, added_at: 10 });
		await applyBookSeriesPlan("aaaaaaaa", {
			remove: null,
			add: { kind: "new", name: "Dune Saga", index: 1 },
		});
		insertBook("bbbbbbbb", { series_name: "Dune", series_index: 2, added_at: 20 });
		insertBook("cccccccc", { series_name: "Dune", series_index: 3, added_at: 30 });
		await reconcileSeriesCollections();
		expect(await collections.getCollectionBookIds(DUNE)).toEqual(["bbbbbbbb", "cccccccc"]);
		expect((await inDune("aaaaaaaa"))?.deleted).toBe(true);
		expect(await collections.getCollectionBookIds(DUNE_SAGA)).toEqual(["aaaaaaaa"]);
	});

	it("choosing the file's own series does not dismiss the book from it", async () => {
		insertBook("aaaaaaaa", { series_name: "Dune", series_index: 1, added_at: 10 });
		await applyBookSeriesPlan("aaaaaaaa", {
			remove: null,
			add: { kind: "new", name: "dune", index: 1 },
		});
		expect(await inDune("aaaaaaaa")).toMatchObject({ deleted: false });
	});
});
