import { WISHLIST_PUSH_MAX } from "@lesefluss/core";
import { describe, expect, it } from "vitest";
import type { WishlistItem } from "../../db/schema";
import { buildWishlistMerge, pushableWishlist, wishlistItemToSync } from "../wishlist-sync";

function item(id: string, over: Partial<WishlistItem> = {}): WishlistItem {
	return {
		id,
		kind: "catalog",
		ref: "gutenberg:1342",
		title: "Pride and Prejudice",
		author: null,
		coverUrl: null,
		deleted: false,
		createdAt: 1_000,
		updatedAt: 1_000,
		...over,
	};
}

describe("buildWishlistMerge", () => {
	it("lands an item this device has not seen", () => {
		const merge = buildWishlistMerge([], [wishlistItemToSync(item("w1"))]);
		expect(merge.upserts).toEqual([item("w1")]);
		expect(merge.deletes).toEqual([]);
	});

	it("a server tombstone removes the local row, even a newer one", () => {
		const local = item("w1", { updatedAt: 9_000 });
		const merge = buildWishlistMerge(
			[local],
			[wishlistItemToSync(item("w1", { deleted: true, updatedAt: 2_000 }))],
		);
		expect(merge.deletes).toEqual(["w1"]);
		expect(merge.upserts).toEqual([]);
	});

	it("a server tombstone for a row this device never had is ignored", () => {
		const merge = buildWishlistMerge([], [wishlistItemToSync(item("w1", { deleted: true }))]);
		expect(merge.deletes).toEqual([]);
	});

	it("a local tombstone beats a live server row until it is pushed", () => {
		const merge = buildWishlistMerge(
			[item("w1", { deleted: true, updatedAt: 1_500 })],
			[wishlistItemToSync(item("w1", { title: "Renamed", updatedAt: 5_000 }))],
		);
		expect(merge.upserts).toEqual([]);
	});

	it("live rows go newest-wins", () => {
		const local = [item("w1", { updatedAt: 2_000 })];
		expect(
			buildWishlistMerge(local, [
				wishlistItemToSync(item("w1", { title: "Old", updatedAt: 1_500 })),
			]).upserts,
		).toEqual([]);
		expect(
			buildWishlistMerge(local, [
				wishlistItemToSync(item("w1", { title: "New", updatedAt: 3_000 })),
			]).upserts,
		).toEqual([item("w1", { title: "New", updatedAt: 3_000 })]);
	});

	it("counts and skips malformed rows", () => {
		const merge = buildWishlistMerge(
			[],
			[
				{ ...wishlistItemToSync(item("w1")), ref: "javascript:alert(1)", kind: "serial" },
				{ ...wishlistItemToSync(item("w2")), coverUrl: "javascript:alert(1)" },
				{ nope: true },
				wishlistItemToSync(item("w3")),
			],
		);
		expect(merge.rejected).toBe(3);
		expect(merge.upserts.map((row) => row.id)).toEqual(["w3"]);
	});
});

describe("pushableWishlist", () => {
	it("carries tombstones and keeps an invalid row local", () => {
		const { wishlist, rejected } = pushableWishlist([
			item("w1", { deleted: true }),
			item("w2", { ref: "not a catalog id" }),
		]);
		expect(wishlist.map((row) => row.itemId)).toEqual(["w1"]);
		expect(rejected).toBe(1);
	});

	it("caps the push at the newest rows", () => {
		const rows = Array.from({ length: WISHLIST_PUSH_MAX + 2 }, (_, i) =>
			item(`w${i}`, { updatedAt: i }),
		);
		const { wishlist } = pushableWishlist(rows);
		expect(wishlist).toHaveLength(WISHLIST_PUSH_MAX);
		expect(wishlist.some((row) => row.itemId === "w0" || row.itemId === "w1")).toBe(false);
	});
});
