import { MAX_SYNCED_CONTENT_BYTES } from "@lesefluss/core";
import { describe, expect, it } from "vitest";
import { shareBlockerFor } from "../book-buddy-read";

const book = { id: "aaaaaaaa", seriesId: null, size: 10, deleted: false };
const refused = new Set(["aaaaaaaa"]);

describe("shareBlockerFor", () => {
	it("calls a book refused for storage quota_full, not not_synced", () => {
		expect(shareBlockerFor(book, new Set(), refused)).toBe("quota_full");
	});

	it("says so even while the server's content list is still loading", () => {
		expect(shareBlockerFor(book, undefined, refused)).toBe("quota_full");
	});

	it("keeps local_only for a book too large to ever sync", () => {
		expect(
			shareBlockerFor({ ...book, size: MAX_SYNCED_CONTENT_BYTES + 1 }, new Set(), refused),
		).toBe("local_only");
	});

	it("is not_synced for a book merely waiting for its upload", () => {
		expect(shareBlockerFor(book, new Set())).toBe("not_synced");
	});

	it("is null once the server holds the book's content", () => {
		expect(shareBlockerFor(book, new Set(["aaaaaaaa"]))).toBeNull();
	});
});
