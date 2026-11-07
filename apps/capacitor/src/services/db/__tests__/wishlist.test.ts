// @vitest-environment node
import { SyncWishlistItemSchema } from "@lesefluss/core";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "./test-db";

const { db, raw, close } = createTestDb();
vi.mock("../index", () => ({
	get db() {
		return db;
	},
}));
vi.mock("@capacitor/preferences", () => ({
	Preferences: { get: async () => ({ value: null }), set: async () => {} },
}));
vi.mock("../../sync", () => ({ scheduleSyncPush: () => {} }));
afterAll(close);

const wishlist = await import("../queries/wishlist");
const { wishlistItemToSync } = await import("../../sync/wishlist-sync");

const PRIDE = { kind: "catalog", ref: "gutenberg:1342", title: "Pride and Prejudice" } as const;
const MOTHER = {
	kind: "serial",
	ref: "https://www.royalroad.com/fiction/21220/mother-of-learning",
	title: "Mother of Learning",
} as const;

function storedRows() {
	return raw.prepare("SELECT id, ref, deleted FROM wishlist ORDER BY created_at").all();
}

beforeEach(() => {
	raw.exec("DELETE FROM wishlist;");
});

describe("wishlist queries", () => {
	it("lists saved titles newest first, without removed ones", async () => {
		await wishlist.addToWishlist(PRIDE, 10);
		await wishlist.addToWishlist(MOTHER, 20);
		await wishlist.addToWishlist({ kind: "catalog", ref: "se:x/y", title: "Gone" }, 30);
		await wishlist.removeFromWishlist("catalog", "se:x/y", 40);
		expect((await wishlist.getWishlist()).map((item) => item.title)).toEqual([
			"Mother of Learning",
			"Pride and Prejudice",
		]);
	});

	it("saving a title twice keeps one entry", async () => {
		const first = await wishlist.addToWishlist(PRIDE, 10);
		const again = await wishlist.addToWishlist(PRIDE, 20);
		expect(again.id).toBe(first.id);
		expect(storedRows()).toHaveLength(1);
	});

	it("matches a series however its URL is spelled", async () => {
		await wishlist.addToWishlist(MOTHER, 10);
		const spelled = "https://royalroad.com/fiction/21220/mother-of-learning/";
		expect((await wishlist.addToWishlist({ ...MOTHER, ref: spelled }, 20)).ref).toBe(MOTHER.ref);
		expect(await wishlist.removeFromWishlist("serial", spelled, 30)).toBe(true);
		expect(await wishlist.getWishlist()).toEqual([]);
	});

	it("unsaving tombstones the row so the removal syncs, and saving again makes a new one", async () => {
		const first = await wishlist.addToWishlist(PRIDE, 10);
		expect(await wishlist.removeFromWishlist("catalog", PRIDE.ref, 20)).toBe(true);
		expect(await wishlist.removeFromWishlist("catalog", PRIDE.ref, 25)).toBe(false);
		const again = await wishlist.addToWishlist(PRIDE, 30);
		expect(again.id).not.toBe(first.id);
		expect(storedRows()).toEqual([
			{ id: first.id, ref: PRIDE.ref, deleted: 1 },
			{ id: again.id, ref: PRIDE.ref, deleted: 0 },
		]);
		const removed = (await wishlist.getAllWishlistForSync()).find((item) => item.id === first.id);
		expect(removed).toMatchObject({ deleted: true, updatedAt: 20 });
	});

	it("shows a title saved on two devices once", async () => {
		await wishlist.upsertWishlist([
			{
				id: "a1",
				...PRIDE,
				author: null,
				coverUrl: null,
				deleted: false,
				createdAt: 10,
				updatedAt: 10,
			},
			{
				id: "b2",
				...PRIDE,
				author: null,
				coverUrl: null,
				deleted: false,
				createdAt: 20,
				updatedAt: 20,
			},
		]);
		expect((await wishlist.getWishlist()).map((item) => item.id)).toEqual(["b2"]);
		await wishlist.removeFromWishlist("catalog", PRIDE.ref, 30);
		expect(await wishlist.getWishlist()).toEqual([]);
	});

	it("stores what a push accepts: trimmed, capped text and only a short http(s) cover", async () => {
		const item = await wishlist.addToWishlist({
			kind: "serial",
			ref: MOTHER.ref,
			title: `  ${"t".repeat(600)}  `,
			author: `  ${"a".repeat(300)}`,
			coverUrl: "data:image/png;base64,AAAA",
		});
		expect(item.title).toHaveLength(500);
		expect(item.author).toHaveLength(200);
		expect(item.coverUrl).toBeNull();
		expect(SyncWishlistItemSchema.safeParse(wishlistItemToSync(item)).success).toBe(true);
	});

	it("upserts last-write-wins and hard-deletes by id", async () => {
		const base = { ...PRIDE, author: null, coverUrl: null, deleted: false, createdAt: 10 };
		await wishlist.upsertWishlist([{ id: "a1", ...base, updatedAt: 20 }]);
		await wishlist.upsertWishlist([{ id: "a1", ...base, title: "Older", updatedAt: 15 }]);
		expect((await wishlist.getWishlist())[0]?.title).toBe("Pride and Prejudice");
		await wishlist.upsertWishlist([{ id: "a1", ...base, title: "Newer", updatedAt: 30 }]);
		expect((await wishlist.getWishlist())[0]?.title).toBe("Newer");
		await wishlist.hardDeleteWishlist(["a1"]);
		expect(storedRows()).toEqual([]);
	});

	it("deleting everything tombstones every live item", async () => {
		await wishlist.addToWishlist(PRIDE, 10);
		await wishlist.addToWishlist(MOTHER, 20);
		await wishlist.deleteAllWishlist(30);
		expect(await wishlist.getWishlist()).toEqual([]);
		expect((await wishlist.getAllWishlistForSync()).every((item) => item.deleted)).toBe(true);
	});
});
