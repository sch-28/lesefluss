import { type SyncBook, SyncPayloadSchema, SyncWishlistItemSchema } from "@lesefluss/core";
import { describe, expect, it } from "vitest";

function chapterRow(i: number): SyncBook {
	const id = i.toString(16).padStart(8, "0");
	return {
		bookId: id,
		title: `Chapter ${i}`,
		author: null,
		fileSize: 0,
		wordCount: null,
		wordPosition: 0,
		seriesId: "9d95aaa3",
		chapterIndex: i,
		chapterSourceUrl: `https://example.com/c/${i}`,
		chapterStatus: "fetched",
		deleted: false,
		updatedAt: 1700000000000,
	};
}

describe("SyncPayloadSchema (TASK-102 regression)", () => {
	it("accepts a 13k-row payload of chapter-only books", () => {
		const books = Array.from({ length: 13_000 }, (_, i) => chapterRow(i));
		const result = SyncPayloadSchema.safeParse({
			books,
			settings: null,
			highlights: [],
			glossaryEntries: [],
			series: [],
		});
		expect(result.success).toBe(true);
	});

	it("rejects payloads above the 50k books cap", () => {
		const books = Array.from({ length: 50_001 }, (_, i) => chapterRow(i));
		const result = SyncPayloadSchema.safeParse({
			books,
			settings: null,
			highlights: [],
			glossaryEntries: [],
			series: [],
		});
		expect(result.success).toBe(false);
	});
});

describe("SyncPayloadSchema word-only shape", () => {
	const baseBook: SyncBook = {
		bookId: "deadbeef",
		title: "Test",
		author: null,
		fileSize: 100,
		wordCount: 50,
		wordPosition: 7,
		chapterStatus: "fetched",
		deleted: false,
		updatedAt: 1700000000000,
	};

	it("accepts a book with word-unit position", () => {
		const result = SyncPayloadSchema.safeParse({
			books: [baseBook],
			settings: null,
			highlights: [],
			glossaryEntries: [],
			series: [],
		});
		expect(result.success).toBe(true);
	});

	it("accepts a word-anchored highlight", () => {
		const result = SyncPayloadSchema.safeParse({
			books: [],
			settings: null,
			highlights: [
				{
					highlightId: "h1",
					bookId: "deadbeef",
					startWord: 2,
					startCharInWord: 0,
					endWord: 4,
					endCharInWord: 3,
					color: "yellow",
					note: null,
					text: null,
					deleted: false,
					createdAt: 1,
					updatedAt: 2,
				},
			],
			glossaryEntries: [],
			series: [],
		});
		expect(result.success).toBe(true);
	});

	it("accepts a reading session with word bounds", () => {
		const result = SyncPayloadSchema.safeParse({
			books: [],
			settings: null,
			highlights: [],
			glossaryEntries: [],
			series: [],
			readingSessions: [
				{
					sessionId: "s1",
					bookId: "deadbeef",
					mode: "rsvp",
					startedAt: 1,
					endedAt: 2,
					durationMs: 1,
					wordsRead: 5,
					startWord: 0,
					endWord: 5,
					wpmAvg: 350,
					updatedAt: 2,
				},
			],
		});
		expect(result.success).toBe(true);
	});
});

describe("SyncWishlistItemSchema", () => {
	const item = {
		itemId: "a1b2c3d4e5f60718",
		kind: "catalog",
		ref: "gutenberg:1342",
		title: "Pride and Prejudice",
		author: null,
		coverUrl: null,
		deleted: false,
		createdAt: 1700000000000,
		updatedAt: 1700000000000,
	};

	it.each([
		["a Gutenberg id", { ref: "gutenberg:1342" }],
		["a Standard Ebooks id", { ref: "se:mary-shelley/frankenstein" }],
		["a source with an underscore", { ref: "standard_ebooks:jane-austen/emma" }],
		["a series URL", { kind: "serial", ref: "https://www.royalroad.com/fiction/1/x" }],
		["an http cover", { coverUrl: "https://covers.test/a.jpg" }],
	])("accepts %s", (_name, over) => {
		expect(SyncWishlistItemSchema.safeParse({ ...item, ...over }).success).toBe(true);
	});

	it.each([
		["a URL as a catalog ref", { ref: "https://example.test/book" }],
		["a catalog id as a series ref", { kind: "serial", ref: "gutenberg:1342" }],
		["a script URL as a series ref", { kind: "serial", ref: "javascript:alert(1)" }],
		["a data URL cover", { coverUrl: "data:image/png;base64,AAAA" }],
		["an unknown kind", { kind: "podcast" }],
	])("rejects %s", (_name, over) => {
		expect(SyncWishlistItemSchema.safeParse({ ...item, ...over }).success).toBe(false);
	});

	it("keeps an omitted wishlist omitted, so it never reads as an empty one", () => {
		const result = SyncPayloadSchema.parse({ books: [], settings: null, highlights: [] });
		expect(result.wishlist).toBeUndefined();
	});
});
