import { type SyncBook, SyncPayloadSchema } from "@lesefluss/core";
import { describe, expect, it } from "vitest";

function chapterRow(i: number): SyncBook {
	const id = i.toString(16).padStart(8, "0");
	return {
		bookId: id,
		title: `Chapter ${i}`,
		author: null,
		fileSize: 0,
		wordCount: null,
		position: 0,
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

// ADR-0002 (TASK-136): sync accepts both byte-only and word+byte shapes
// during Release N. Release N+1 will drop the byte fields.
describe("SyncPayloadSchema accepts byte-only and word-mirrored shapes", () => {
	const baseBook: SyncBook = {
		bookId: "deadbeef",
		title: "Test",
		author: null,
		fileSize: 100,
		wordCount: 50,
		position: 42,
		chapterStatus: "fetched",
		deleted: false,
		updatedAt: 1700000000000,
	};

	it("accepts an old-client byte-only book", () => {
		const result = SyncPayloadSchema.safeParse({
			books: [baseBook],
			settings: null,
			highlights: [],
			glossaryEntries: [],
			series: [],
		});
		expect(result.success).toBe(true);
	});

	it("accepts a new-client book with both byte and word fields", () => {
		const result = SyncPayloadSchema.safeParse({
			books: [{ ...baseBook, wordPosition: 7, positionUnit: "word" }],
			settings: null,
			highlights: [],
			glossaryEntries: [],
			series: [],
		});
		expect(result.success).toBe(true);
	});

	it("accepts a highlight with mirrored Option A anchors", () => {
		const result = SyncPayloadSchema.safeParse({
			books: [],
			settings: null,
			highlights: [
				{
					highlightId: "h1",
					bookId: "deadbeef",
					startOffset: 10,
					endOffset: 20,
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

	it("accepts a reading session with both byte and word bounds", () => {
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
					startPos: 0,
					endPos: 50,
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
