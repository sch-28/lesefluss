import { describe, expect, test } from "vitest";
import {
	describeTombstoneCounts,
	NO_TOMBSTONES,
	tombstoneCountsInScope,
	tombstoneTotal,
} from "./tombstone-counts";

const byUser = [
	{ userId: "alice", books: 2, highlights: 0, bookmarks: 3, wishlist: 1 },
	{ userId: "bob", books: 0, highlights: 4, bookmarks: 0, wishlist: 0 },
];

describe("tombstoneCountsInScope", () => {
	test("sums every user for all, and one user's own counts for a user id", () => {
		expect(tombstoneCountsInScope(byUser, "all")).toEqual({
			books: 2,
			highlights: 4,
			bookmarks: 3,
			wishlist: 1,
		});
		expect(tombstoneCountsInScope(byUser, "bob")).toEqual({
			books: 0,
			highlights: 4,
			bookmarks: 0,
			wishlist: 0,
		});
		expect(tombstoneCountsInScope(byUser, "carol")).toEqual(NO_TOMBSTONES);
	});
});

describe("tombstoneTotal", () => {
	test("is zero only when every kind is zero", () => {
		expect(tombstoneTotal(NO_TOMBSTONES)).toBe(0);
		expect(tombstoneTotal({ ...NO_TOMBSTONES, highlights: 1 })).toBe(1);
		expect(tombstoneTotal({ ...NO_TOMBSTONES, bookmarks: 1 })).toBe(1);
		expect(tombstoneTotal({ ...NO_TOMBSTONES, wishlist: 1 })).toBe(1);
		expect(tombstoneTotal(tombstoneCountsInScope(byUser, "all"))).toBe(10);
	});
});

describe("describeTombstoneCounts", () => {
	test("names every kind with its count, zeros included", () => {
		expect(describeTombstoneCounts({ books: 2, highlights: 0, bookmarks: 1, wishlist: 3 })).toBe(
			"2 books, 0 highlights, 1 bookmark, 3 wishlist items",
		);
		expect(describeTombstoneCounts({ books: 1, highlights: 1, bookmarks: 0, wishlist: 1 })).toBe(
			"1 book, 1 highlight, 0 bookmarks, 1 wishlist item",
		);
	});
});
