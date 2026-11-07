import { BOOKMARKS_PUSH_MAX, SyncPayloadSchema, wordPos } from "@lesefluss/core";
import { describe, expect, it } from "vitest";
import type { Bookmark } from "../../db/schema";
import { bookmarkToSync, buildBookmarkMerge, pushableBookmarks } from "../bookmark-sync";

function mark(overrides: Partial<Bookmark> = {}): Bookmark {
	return {
		id: "b1",
		bookId: "aaaaaaaa",
		word: wordPos(420),
		label: "Chapter 3",
		deleted: false,
		createdAt: 1_000,
		updatedAt: 1_000,
		...overrides,
	};
}

const LIVE = new Set(["aaaaaaaa"]);

describe("bookmark sync", () => {
	it("a payload without bookmarks parses and leaves them out", () => {
		const parsed = SyncPayloadSchema.parse({ books: [], settings: null, highlights: [] });
		expect(parsed.bookmarks).toBeUndefined();
	});

	it("a pushed bookmark merges into a fresh device at the same word", () => {
		const { bookmarks } = pushableBookmarks([mark()], LIVE);
		const payload = SyncPayloadSchema.parse({
			books: [],
			settings: null,
			highlights: [],
			bookmarks,
		});
		expect(buildBookmarkMerge([], payload.bookmarks ?? [], LIVE)).toEqual({
			upserts: [mark()],
			deletes: [],
			rejected: 0,
		});
	});

	it("takes a newer server row and keeps a local row that is newer or equal", () => {
		const server = [bookmarkToSync(mark({ label: "Server", updatedAt: 2_000 }))];
		expect(buildBookmarkMerge([mark()], server, LIVE).upserts).toEqual([
			mark({ label: "Server", updatedAt: 2_000 }),
		]);
		expect(buildBookmarkMerge([mark({ updatedAt: 2_000 })], server, LIVE).upserts).toEqual([]);
	});

	it("a server tombstone removes the local row, even one edited later", () => {
		const server = [bookmarkToSync(mark({ deleted: true, updatedAt: 2_000 }))];
		expect(buildBookmarkMerge([mark({ updatedAt: 3_000 })], server, LIVE).deletes).toEqual(["b1"]);
		expect(buildBookmarkMerge([], server, LIVE)).toEqual({ upserts: [], deletes: [], rejected: 0 });
	});

	it("a local delete not pushed yet wins over a newer live server row", () => {
		const server = [bookmarkToSync(mark({ updatedAt: 5_000 }))];
		const merge = buildBookmarkMerge([mark({ deleted: true, updatedAt: 2_000 })], server, LIVE);
		expect(merge).toEqual({ upserts: [], deletes: [], rejected: 0 });
	});

	it("skips bookmarks of books this device does not hold and counts malformed rows", () => {
		const server = [
			bookmarkToSync(mark({ bookId: "cccccccc" })),
			{ ...bookmarkToSync(mark({ id: "b2" })), word: -1 },
			{ bookmarkId: "b3" },
		];
		expect(buildBookmarkMerge([], server, LIVE)).toEqual({ upserts: [], deletes: [], rejected: 2 });
	});

	it("pushes tombstones too, but only for books the push carries", () => {
		const local = [
			mark(),
			mark({ id: "b2", deleted: true, updatedAt: 2_000 }),
			mark({ id: "b3", bookId: "cccccccc" }),
		];
		expect(pushableBookmarks(local, LIVE).bookmarks.map((b) => b.bookmarkId)).toEqual(["b1", "b2"]);
	});

	it("holds back a row the server would refuse, so the rest of the push still lands", () => {
		const local = [mark(), mark({ id: "b2", label: "x".repeat(500) })];
		const { bookmarks, rejected } = pushableBookmarks(local, LIVE);
		expect(bookmarks.map((b) => b.bookmarkId)).toEqual(["b1"]);
		expect(rejected).toBe(1);
	});

	it("caps the push at the newest rows the server accepts", () => {
		const local = Array.from({ length: BOOKMARKS_PUSH_MAX + 1 }, (_, i) =>
			mark({ id: `b${i}`, updatedAt: i }),
		);
		const { bookmarks } = pushableBookmarks(local, LIVE);
		expect(bookmarks).toHaveLength(BOOKMARKS_PUSH_MAX);
		expect(bookmarks.some((b) => b.bookmarkId === "b0")).toBe(false);
		expect(() =>
			SyncPayloadSchema.parse({ books: [], settings: null, highlights: [], bookmarks }),
		).not.toThrow();
	});
});
