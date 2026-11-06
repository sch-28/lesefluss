// @vitest-environment node
import { type SyncBook, WordIndex } from "@lesefluss/core";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "./test-db";

const { db, raw, close } = createTestDb();
vi.mock("../index", () => ({
	get db() {
		return db;
	},
}));
afterAll(close);

const { applyBookMerge, backfillWordCounts, getBooksForSync, setMissingWordCount } = await import(
	"../queries/books"
);
const { buildBookMergeUpdate } = await import("../../sync/book-merge");

const TEXT = "It was a bright cold day in April, and the clocks were striking thirteen.";
const TEXT_WORDS = WordIndex.build(TEXT).wordCount;

function insertBook(id: string, overrides: Record<string, string | number | null> = {}) {
	const row = {
		id,
		title: "Book",
		file_format: "epub",
		size: 1,
		word_position: 3,
		word_count: 0,
		is_active: 0,
		added_at: 500,
		deleted: 0,
		updated_at: 1000,
		metadata_updated_at: 1000,
		series_id: null,
		...overrides,
	};
	const keys = Object.keys(row);
	raw
		.prepare(`INSERT INTO books (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`)
		.run(...Object.values(row));
}

function insertContent(id: string, content = TEXT) {
	raw.prepare("INSERT INTO book_content (book_id, content) VALUES (?, ?)").run(id, content);
}

function readBook(id: string) {
	return raw
		.prepare("SELECT word_count, updated_at, metadata_updated_at FROM books WHERE id = ?")
		.get(id) as { word_count: number; updated_at: number; metadata_updated_at: number };
}

beforeEach(() => {
	raw.exec("DELETE FROM book_content; DELETE FROM books;");
});

describe("backfillWordCounts", () => {
	it("counts a book with content and leaves its stamps alone", async () => {
		insertBook("old");
		insertContent("old");

		expect(await backfillWordCounts()).toBe(1);

		expect(TEXT_WORDS).toBeGreaterThan(0);
		expect(readBook("old")).toEqual({
			word_count: TEXT_WORDS,
			updated_at: 1000,
			metadata_updated_at: 1000,
		});
	});

	it("leaves a serial chapter that has no content yet at 0", async () => {
		insertBook("pending", { series_id: "s1", chapter_status: "pending" });

		await expect(backfillWordCounts()).resolves.toBe(0);

		expect(readBook("pending").word_count).toBe(0);
	});

	it("keeps a count that is already there and skips tombstones", async () => {
		insertBook("counted", { word_count: 42 });
		insertContent("counted");
		insertBook("gone", { deleted: 1 });
		insertContent("gone");

		expect(await backfillWordCounts()).toBe(0);

		expect(readBook("counted").word_count).toBe(42);
		expect(readBook("gone").word_count).toBe(0);
	});
});

describe("setMissingWordCount", () => {
	it("never overwrites a count that arrived meanwhile", async () => {
		insertBook("b1", { word_count: 77 });

		await setMissingWordCount("b1", TEXT_WORDS);

		expect(readBook("b1").word_count).toBe(77);
	});
});

describe("a count healed on another device", () => {
	function serverBook(overrides: Partial<SyncBook> = {}): SyncBook {
		return {
			bookId: "b1",
			title: "Book",
			author: null,
			fileSize: 1,
			wordCount: TEXT_WORDS,
			wordPosition: 3,
			chapterStatus: "fetched",
			deleted: false,
			updatedAt: 1000,
			metadataUpdatedAt: 1000,
			addedAt: 500,
			...overrides,
		};
	}

	async function pull(server: SyncBook) {
		const local = (await getBooksForSync()).find((b) => b.id === "b1");
		if (!local) throw new Error("no local row");
		const update = buildBookMergeUpdate(local, server);
		if (update) await applyBookMerge("b1", update, server.updatedAt);
	}

	it("fills a zero count even when no stamp is newer", async () => {
		insertBook("b1");

		await pull(serverBook());

		expect(readBook("b1")).toEqual({
			word_count: TEXT_WORDS,
			updated_at: 1000,
			metadata_updated_at: 1000,
		});
	});

	it("fills a zero count when the server position is older than ours", async () => {
		insertBook("b1", { updated_at: 5000 });

		await pull(serverBook({ updatedAt: 2000, wordPosition: 1 }));

		expect(readBook("b1")).toMatchObject({ word_count: TEXT_WORDS, updated_at: 5000 });
	});
});
