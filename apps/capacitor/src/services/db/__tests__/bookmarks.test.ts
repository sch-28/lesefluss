// @vitest-environment node
import { BOOKMARK_LABEL_MAX, wordPos } from "@lesefluss/core";
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

const marks = await import("../queries/bookmarks");
const { deleteBook, hardDeleteBook } = await import("../queries/books");
const { deleteSeries } = await import("../queries/series");

function insertBook(id: string, seriesId: string | null = null) {
	raw
		.prepare(
			"INSERT INTO books (id, title, file_format, size, word_position, word_count, is_active, added_at, deleted, series_id) VALUES (?, ?, 'txt', 1, 0, 1000, 0, 0, 0, ?)",
		)
		.run(id, id, seriesId);
}

function storedRows() {
	return raw.prepare("SELECT id, deleted FROM bookmarks ORDER BY id").all();
}

beforeEach(() => {
	raw.exec("DELETE FROM bookmarks; DELETE FROM books; DELETE FROM series;");
	insertBook("aaaaaaaa");
	insertBook("bbbbbbbb");
});

describe("bookmark queries", () => {
	it("lists a book's bookmarks in reading order, without other books' or deleted ones", async () => {
		const late = await marks.addBookmark({ bookId: "aaaaaaaa", word: wordPos(900) }, 10);
		const early = await marks.addBookmark({ bookId: "aaaaaaaa", word: wordPos(5) }, 20);
		const gone = await marks.addBookmark({ bookId: "aaaaaaaa", word: wordPos(50) }, 30);
		await marks.addBookmark({ bookId: "bbbbbbbb", word: wordPos(1) }, 40);
		await marks.deleteBookmark(gone.id, 50);
		expect((await marks.getBookmarksByBook("aaaaaaaa")).map((b) => b.id)).toEqual([
			early.id,
			late.id,
		]);
	});

	it("trims the label, caps its length and stores a blank one as none", async () => {
		const a = await marks.addBookmark({ bookId: "aaaaaaaa", word: wordPos(1), label: "  Ch. 3  " });
		const b = await marks.addBookmark({
			bookId: "aaaaaaaa",
			word: wordPos(2),
			label: "x".repeat(BOOKMARK_LABEL_MAX + 50),
		});
		const c = await marks.addBookmark({ bookId: "aaaaaaaa", word: wordPos(3), label: "   " });
		expect(a.label).toBe("Ch. 3");
		expect(b.label).toHaveLength(BOOKMARK_LABEL_MAX);
		expect(c.label).toBeNull();
	});

	it("toggling adds a bookmark at the first visible word, toggling again removes it", async () => {
		const added = await marks.toggleBookmarkOnScreen("aaaaaaaa", wordPos(42), wordPos(300), 10);
		expect(added).toMatchObject({ bookId: "aaaaaaaa", word: 42, createdAt: 10 });
		expect(
			await marks.toggleBookmarkOnScreen("aaaaaaaa", wordPos(40), wordPos(290), 20),
		).toBeNull();
		expect(await marks.getBookmarksByBook("aaaaaaaa")).toEqual([]);
		expect(await marks.getAllBookmarksForSync()).toEqual([
			expect.objectContaining({ id: added?.id, deleted: true, updatedAt: 20 }),
		]);
	});

	it("toggling leaves bookmarks off screen alone", async () => {
		const before = await marks.addBookmark({ bookId: "aaaaaaaa", word: wordPos(10) }, 1);
		const after = await marks.addBookmark({ bookId: "aaaaaaaa", word: wordPos(500) }, 1);
		await marks.toggleBookmarkOnScreen("aaaaaaaa", wordPos(100), wordPos(400), 2);
		expect((await marks.getBookmarksByBook("aaaaaaaa")).map((b) => b.id)).toEqual([
			before.id,
			expect.any(String),
			after.id,
		]);
	});

	it("stamps a rename and a delete so they win on other devices", async () => {
		const a = await marks.addBookmark({ bookId: "aaaaaaaa", word: wordPos(1) }, 10);
		await marks.renameBookmark(a.id, "Dinner scene", 20);
		expect((await marks.getBookmarksByBook("aaaaaaaa"))[0]).toMatchObject({
			label: "Dinner scene",
			updatedAt: 20,
		});
		await marks.deleteBookmark(a.id, 30);
		await marks.renameBookmark(a.id, "After delete", 40);
		expect(await marks.getAllBookmarksForSync()).toEqual([
			expect.objectContaining({ deleted: true, label: "Dinner scene", updatedAt: 30 }),
		]);
	});

	it("lands a pulled row only when it is newer", async () => {
		const a = await marks.addBookmark({ bookId: "aaaaaaaa", word: wordPos(1), label: "Local" }, 50);
		await marks.upsertBookmarks([{ ...a, label: "Older", updatedAt: 40 }]);
		expect((await marks.getBookmarksByBook("aaaaaaaa"))[0]?.label).toBe("Local");
		await marks.upsertBookmarks([{ ...a, label: "Newer", updatedAt: 60 }]);
		expect((await marks.getBookmarksByBook("aaaaaaaa"))[0]?.label).toBe("Newer");
		await marks.hardDeleteBookmarks([a.id]);
		expect(storedRows()).toEqual([]);
	});

	it("deleting a book tombstones its bookmarks so the delete syncs", async () => {
		const a = await marks.addBookmark({ bookId: "aaaaaaaa", word: wordPos(1) }, 10);
		const b = await marks.addBookmark({ bookId: "bbbbbbbb", word: wordPos(1) }, 10);
		await deleteBook("aaaaaaaa");
		expect(storedRows()).toEqual(
			[
				{ id: a.id, deleted: 1 },
				{ id: b.id, deleted: 0 },
			].sort((x, y) => x.id.localeCompare(y.id)),
		);
	});

	it("a book removed by the pull, or a deleted serial's chapters, take their bookmarks along", async () => {
		raw
			.prepare(
				"INSERT INTO series (id, title, source_url, toc_url, provider, created_at, updated_at) VALUES ('5e5e5e5e', 'S', 'u', 't', 'rss', 0, 0)",
			)
			.run();
		insertBook("c0c0c0c0", "5e5e5e5e");
		await marks.addBookmark({ bookId: "aaaaaaaa", word: wordPos(1) }, 10);
		await marks.addBookmark({ bookId: "c0c0c0c0", word: wordPos(1) }, 10);
		const kept = await marks.addBookmark({ bookId: "bbbbbbbb", word: wordPos(1) }, 10);
		await hardDeleteBook("aaaaaaaa");
		await deleteSeries("5e5e5e5e");
		expect(storedRows()).toEqual([{ id: kept.id, deleted: 0 }]);
	});
});
