// @vitest-environment node
//
// Collection merge rules against a real Postgres database. Skipped when
// DATABASE_URL is unset so it never breaks `pnpm test`.
import { randomUUID } from "node:crypto";
import type { SyncCollection, SyncCollectionBook } from "@lesefluss/core";
import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, test } from "vitest";
import { db } from "~/db";
import { syncCollectionBooks, syncCollections } from "~/db/schema";
import { upsertSyncCollectionBooks, upsertSyncCollections } from "./sync-collection-upsert";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("sync collections upsert (integration)", () => {
	const userId = `test-collection-upsert-${randomUUID()}`;

	afterAll(async () => {
		await db.delete(syncCollections).where(eq(syncCollections.userId, userId));
		await db.delete(syncCollectionBooks).where(eq(syncCollectionBooks.userId, userId));
	});

	function collection(overrides: Partial<SyncCollection> = {}): SyncCollection {
		return {
			collectionId: "c1",
			name: "Favourites",
			sortOrder: 1,
			deleted: false,
			createdAt: 1_000_000,
			updatedAt: 1_000_000,
			...overrides,
		};
	}

	function member(bookId: string, overrides: Partial<SyncCollectionBook> = {}): SyncCollectionBook {
		return { collectionId: "c1", bookId, deleted: false, updatedAt: 1_000_000, ...overrides };
	}

	async function members(collectionId: string) {
		const rows = await db
			.select()
			.from(syncCollectionBooks)
			.where(
				and(
					eq(syncCollectionBooks.userId, userId),
					eq(syncCollectionBooks.collectionId, collectionId),
				),
			);
		return Object.fromEntries(rows.map((r) => [r.bookId, r.deleted]));
	}

	async function readCollection(collectionId: string) {
		const [row] = await db
			.select()
			.from(syncCollections)
			.where(
				and(eq(syncCollections.userId, userId), eq(syncCollections.collectionId, collectionId)),
			);
		return row;
	}

	test("two devices adding different books to one collection keep both", async () => {
		await upsertSyncCollectionBooks(db, userId, [member("aaaaaaaa")]);
		await upsertSyncCollectionBooks(db, userId, [member("bbbbbbbb")]);
		expect(await members("c1")).toEqual({ aaaaaaaa: false, bbbbbbbb: false });
	});

	test("a re-add after a remove wins by updatedAt, and an older remove cannot undo it", async () => {
		await upsertSyncCollectionBooks(db, userId, [
			member("cccccccc", { collectionId: "c2", updatedAt: 1_000 }),
		]);
		await upsertSyncCollectionBooks(db, userId, [
			member("cccccccc", { collectionId: "c2", deleted: true, updatedAt: 2_000 }),
		]);
		expect(await members("c2")).toEqual({ cccccccc: true });
		await upsertSyncCollectionBooks(db, userId, [
			member("cccccccc", { collectionId: "c2", updatedAt: 3_000 }),
		]);
		await upsertSyncCollectionBooks(db, userId, [
			member("cccccccc", { collectionId: "c2", deleted: true, updatedAt: 2_000 }),
		]);
		expect(await members("c2")).toEqual({ cccccccc: false });
	});

	test("a newer rename wins and an older one is ignored", async () => {
		await upsertSyncCollections(db, userId, [collection({ collectionId: "c3" })]);
		await upsertSyncCollections(db, userId, [
			collection({ collectionId: "c3", name: "Later", updatedAt: 3_000_000 }),
		]);
		await upsertSyncCollections(db, userId, [
			collection({ collectionId: "c3", name: "Earlier", updatedAt: 2_000_000 }),
		]);
		expect((await readCollection("c3"))?.name).toBe("Later");
	});

	test("a collection or membership missing from a push is left alone", async () => {
		await upsertSyncCollections(db, userId, [collection({ collectionId: "c4" })]);
		await upsertSyncCollections(db, userId, [collection({ collectionId: "c5" })]);
		await upsertSyncCollectionBooks(db, userId, []);
		expect((await readCollection("c4"))?.deleted).toBe(false);
		expect(await members("c1")).toEqual({ aaaaaaaa: false, bbbbbbbb: false });
	});

	test("a push repeating one membership keeps the newest copy", async () => {
		await upsertSyncCollectionBooks(db, userId, [
			member("dddddddd", { collectionId: "c6", updatedAt: 5_000 }),
			member("dddddddd", { collectionId: "c6", deleted: true, updatedAt: 6_000 }),
		]);
		expect(await members("c6")).toEqual({ dddddddd: true });
	});
});
