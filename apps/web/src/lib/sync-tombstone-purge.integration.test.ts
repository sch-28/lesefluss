// @vitest-environment node
//
// The admin tombstone cleanup, against a real Postgres database.
// Skipped when DATABASE_URL is unset; point it at a throwaway database.
import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { db } from "~/db";
import { user } from "~/db/auth-schema";
import {
	type NewSyncBookmark,
	type NewSyncWishlistItem,
	syncBookmarks,
	syncBooks,
	syncHighlights,
	syncWishlist,
} from "~/db/schema";
import { countPurgeableTombstones, purgeBookTombstones } from "~/lib/sync-tombstone-purge";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("purgeBookTombstones (integration)", () => {
	const suffix = randomUUID().slice(0, 8);
	const alice = `test-purge-a-${suffix}`;
	const bob = `test-purge-b-${suffix}`;
	const users = [alice, bob];

	async function clear() {
		await db.delete(syncBookmarks).where(inArray(syncBookmarks.userId, users));
		await db.delete(syncWishlist).where(inArray(syncWishlist.userId, users));
		await db.delete(syncHighlights).where(inArray(syncHighlights.userId, users));
		await db.delete(syncBooks).where(inArray(syncBooks.userId, users));
	}

	beforeAll(async () => {
		await db
			.insert(user)
			.values(users.map((id) => ({ id, name: id, email: `${id}@example.test` })));
	});

	beforeEach(clear);

	afterAll(async () => {
		await clear();
		await db.delete(user).where(inArray(user.id, users));
	});

	function mark(userId: string, bookmarkId: string, deleted: boolean): NewSyncBookmark {
		const at = new Date(1_000);
		return {
			userId,
			bookmarkId,
			bookId: "deadbeef",
			word: 42,
			deleted,
			createdAt: at,
			updatedAt: at,
		};
	}

	async function bookmarkIds() {
		const rows = await db
			.select({ userId: syncBookmarks.userId, bookmarkId: syncBookmarks.bookmarkId })
			.from(syncBookmarks)
			.where(inArray(syncBookmarks.userId, users));
		return rows.map((r) => `${r.userId === alice ? "alice" : "bob"}:${r.bookmarkId}`).sort();
	}

	test("removes one user's bookmark tombstones and leaves live bookmarks and other users alone", async () => {
		await db
			.insert(syncBookmarks)
			.values([mark(alice, "live", false), mark(alice, "gone", true), mark(bob, "gone", true)]);

		const result = await db.transaction((tx) => purgeBookTombstones(tx, alice));

		expect(result.bookmarksRemoved).toBe(1);
		expect(await bookmarkIds()).toEqual(["alice:live", "bob:gone"]);
	});

	// Scoped to one user even here: a purge of everyone would race the other
	// integration files sharing the database.
	test("removes bookmark tombstones in the same run as the book tombstones", async () => {
		await db
			.insert(syncBookmarks)
			.values([mark(alice, "live", false), mark(alice, "gone", true), mark(bob, "gone", true)]);
		await db.insert(syncBooks).values({
			userId: bob,
			bookId: "deadbeef",
			title: "Gone",
			originUserId: bob,
			originBookId: "deadbeef",
			deleted: true,
			updatedAt: new Date(1_000),
		});

		const result = await db.transaction((tx) => purgeBookTombstones(tx, bob));

		expect(result).toEqual({
			booksRemoved: 1,
			highlightsRemoved: 0,
			bookmarksRemoved: 1,
			wishlistRemoved: 0,
		});
		expect(await bookmarkIds()).toEqual(["alice:gone", "alice:live"]);
	});

	function wish(userId: string, itemId: string, deleted: boolean): NewSyncWishlistItem {
		const at = new Date(1_000);
		return {
			userId,
			itemId,
			kind: "catalog",
			ref: "gutenberg:84",
			title: "Frankenstein",
			deleted,
			createdAt: at,
			updatedAt: at,
		};
	}

	test("removes one user's wishlist tombstones and leaves live items and other users alone", async () => {
		await db
			.insert(syncWishlist)
			.values([wish(alice, "live", false), wish(alice, "gone", true), wish(bob, "gone", true)]);

		const result = await db.transaction((tx) => purgeBookTombstones(tx, alice));

		expect(result.wishlistRemoved).toBe(1);
		const rows = await db
			.select({ userId: syncWishlist.userId, itemId: syncWishlist.itemId })
			.from(syncWishlist)
			.where(inArray(syncWishlist.userId, users));
		expect(rows.map((r) => `${r.userId === alice ? "alice" : "bob"}:${r.itemId}`).sort()).toEqual([
			"alice:live",
			"bob:gone",
		]);
	});

	test("counts per kind exactly what the purge then removes, leaving chapters and other users out", async () => {
		const at = new Date(1_000);
		const book = (userId: string, bookId: string, deleted: boolean, seriesId?: string) => ({
			userId,
			bookId,
			title: bookId,
			originUserId: userId,
			originBookId: bookId,
			deleted,
			seriesId: seriesId ?? null,
			updatedAt: at,
		});
		const highlight = (userId: string, highlightId: string, deleted: boolean) => ({
			userId,
			highlightId,
			bookId: "deadbeef",
			startWord: 1,
			endWord: 2,
			deleted,
			createdAt: at,
			updatedAt: at,
		});
		await db
			.insert(syncBooks)
			.values([
				book(alice, "gone0001", true),
				book(alice, "live0001", false),
				book(alice, "chap0001", true, "series01"),
				book(bob, "gone0002", true),
			]);
		await db
			.insert(syncHighlights)
			.values([
				highlight(alice, "gone-1", true),
				highlight(alice, "gone-2", true),
				highlight(alice, "live", false),
			]);
		await db.insert(syncBookmarks).values([mark(alice, "gone", true), mark(bob, "gone", true)]);
		await db.insert(syncWishlist).values([wish(alice, "live", false), wish(alice, "gone", true)]);

		expect(await countPurgeableTombstones(db, alice)).toEqual([
			{ userId: alice, books: 1, highlights: 2, bookmarks: 1, wishlist: 1 },
		]);
		const everyone = await countPurgeableTombstones(db);
		expect(
			everyone
				.filter((r) => users.includes(r.userId))
				.sort((a, b) => a.userId.localeCompare(b.userId)),
		).toEqual([
			{ userId: alice, books: 1, highlights: 2, bookmarks: 1, wishlist: 1 },
			{ userId: bob, books: 1, highlights: 0, bookmarks: 1, wishlist: 0 },
		]);

		expect(await db.transaction((tx) => purgeBookTombstones(tx, alice))).toEqual({
			booksRemoved: 1,
			highlightsRemoved: 2,
			bookmarksRemoved: 1,
			wishlistRemoved: 1,
		});
		expect(await countPurgeableTombstones(db, alice)).toEqual([]);
	});
});
