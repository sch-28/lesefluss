// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../db/__tests__/test-db";

const { db, raw, close } = createTestDb();
vi.mock("../db/index", () => ({
	get db() {
		return db;
	},
}));
vi.mock("@capacitor/preferences", () => ({
	Preferences: { get: async () => ({ value: null }), set: async () => {} },
}));
const scheduleSyncPush = vi.hoisted(() => vi.fn());
vi.mock("../sync", () => ({ scheduleSyncPush }));
afterAll(close);

const { clearImportedFromWishlist } = await import("../wishlist");
const { addToWishlist, getWishlist } = await import("../db/queries/wishlist");

const SERIES = "https://www.royalroad.com/fiction/21220/mother-of-learning";

beforeEach(() => {
	raw.exec("DELETE FROM wishlist;");
	scheduleSyncPush.mockClear();
});

describe("clearImportedFromWishlist", () => {
	it("removes the imported title under any of its spellings and pushes the removal", async () => {
		await addToWishlist({ kind: "serial", ref: SERIES, title: "Mother of Learning" }, 10);
		await addToWishlist({ kind: "catalog", ref: "gutenberg:1342", title: "Pride" }, 20);
		await clearImportedFromWishlist("serial", [
			"https://royalroad.com/fiction/21220/mother-of-learning/chapter/1",
			"https://royalroad.com/fiction/21220/mother-of-learning/",
		]);
		expect((await getWishlist()).map((item) => item.ref)).toEqual(["gutenberg:1342"]);
		expect(scheduleSyncPush).toHaveBeenCalledTimes(1);
	});

	it("does not push when the title was not on the wishlist", async () => {
		await clearImportedFromWishlist("catalog", ["gutenberg:84"]);
		expect(scheduleSyncPush).not.toHaveBeenCalled();
	});

	it("never fails the import that called it", async () => {
		raw.exec("ALTER TABLE wishlist RENAME TO wishlist_gone;");
		try {
			await expect(clearImportedFromWishlist("catalog", ["gutenberg:84"])).resolves.toBeUndefined();
		} finally {
			raw.exec("ALTER TABLE wishlist_gone RENAME TO wishlist;");
		}
	});
});
