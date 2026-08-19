import {
	MAX_SYNCED_COVER_CHARS,
	MAX_SYNCED_JSON_CHARS,
	SyncBookSchema,
	wordPos,
} from "@lesefluss/core";
import { describe, expect, it } from "vitest";
import type { Book, BookContent } from "../../db/schema";
import { bookToSync, shouldPushBook } from "../index";

function makeBook(overrides: Partial<Book> = {}): Book {
	return {
		id: "deadbeef",
		title: "T",
		author: null,
		fileFormat: "txt",
		filePath: null,
		size: 0,
		wordPosition: wordPos(0),
		isActive: false,
		addedAt: 0,
		lastRead: null,
		source: null,
		catalogId: null,
		sourceUrl: null,
		deleted: false,
		seriesId: null,
		chapterIndex: null,
		chapterSourceUrl: null,
		chapterStatus: "fetched",
		...overrides,
	} as Book;
}

const content: BookContent = {
	bookId: "deadbeef",
	content: "body text",
	coverImage: "cover-bytes",
	chapters: '[{"title":"a","startByte":0}]',
	wordIndex: null,
	linkRanges: '[{"href":"https://e.example","startWord":1,"endWord":2}]',
};

describe("bookToSync", () => {
	it("includes content/coverImage/chapters/linkRanges for standalone books", () => {
		const out = bookToSync(makeBook(), content);
		expect(out.content).toBe("body text");
		expect(out.coverImage).toBe("cover-bytes");
		expect(out.chapters).toBe('[{"title":"a","startByte":0}]');
		expect(out.linkRanges).toBe('[{"href":"https://e.example","startWord":1,"endWord":2}]');
	});

	it("omits content/coverImage/chapters/linkRanges for chapter rows even when contentData is supplied", () => {
		const out = bookToSync(makeBook({ seriesId: "abc12345", chapterIndex: 0 }), content);
		expect(out).not.toHaveProperty("content");
		expect(out).not.toHaveProperty("coverImage");
		expect(out).not.toHaveProperty("chapters");
		expect(out).not.toHaveProperty("linkRanges");
		// Lightweight chapter metadata still flows through.
		expect(out.seriesId).toBe("abc12345");
		expect(out.chapterIndex).toBe(0);
	});

	it("omits content for tombstoned books", () => {
		const out = bookToSync(makeBook({ deleted: true }), content);
		expect(out).not.toHaveProperty("content");
	});

	it("drops a blob the schema would reject rather than losing the whole push", () => {
		// The server validates a push in one pass, so an EPUB cover over the cap
		// would 400 every other book, highlight and setting in the batch.
		const out = bookToSync(makeBook({ updatedAt: 1 }), {
			...content,
			coverImage: "x".repeat(MAX_SYNCED_COVER_CHARS + 1),
			chapters: "y".repeat(MAX_SYNCED_JSON_CHARS + 1),
		});
		expect(out.coverImage).toBeNull();
		expect(out.chapters).toBeNull();
		// Fields within their cap are untouched.
		expect(out.content).toBe("body text");
		expect(SyncBookSchema.safeParse(out).success).toBe(true);
	});

	it("sends the row's own updatedAt, not one derived from reading history", () => {
		// The derived value this replaced was max(lastRead, addedAt), which could
		// not see an edit that moved no reading position.
		const out = bookToSync(makeBook({ addedAt: 1000, lastRead: 2000, updatedAt: 3000 }));
		expect(out.updatedAt).toBe(3000);
	});

	it("carries the add date, so a restore does not have to invent one", () => {
		const out = bookToSync(makeBook({ addedAt: 1000, updatedAt: 3000 }));
		expect(out.addedAt).toBe(1000);
	});

	it("carries the add date on a tombstone", () => {
		// Not reader-written text, so the rule that strips a review does not apply:
		// a re-added book should keep the date it first arrived.
		const out = bookToSync(makeBook({ addedAt: 1000, deleted: true }));
		expect(out.addedAt).toBe(1000);
	});

	it("carries reader-editable metadata", () => {
		const out = bookToSync(
			makeBook({
				description: "A blurb",
				language: "de",
				status: "dropped",
				rating: 4,
				review: "Not for me",
				tags: '["scifi"]',
			}),
		);
		expect(out).toMatchObject({
			description: "A blurb",
			language: "de",
			status: "dropped",
			rating: 4,
			review: "Not for me",
			tags: '["scifi"]',
		});
	});
});

describe("shouldPushBook", () => {
	it("excludes pristine pending chapter rows", () => {
		const ch = makeBook({
			seriesId: "abc",
			chapterStatus: "pending",
			wordPosition: wordPos(0),
			lastRead: null,
		});
		expect(shouldPushBook(ch)).toBe(false);
	});

	it("includes pending chapter with reading progress", () => {
		expect(
			shouldPushBook(
				makeBook({ seriesId: "abc", chapterStatus: "pending", wordPosition: wordPos(42) }),
			),
		).toBe(true);
	});

	it("includes pending chapter that has been touched (lastRead set)", () => {
		expect(
			shouldPushBook(makeBook({ seriesId: "abc", chapterStatus: "pending", lastRead: 1000 })),
		).toBe(true);
	});

	it("includes fetched chapter", () => {
		expect(
			shouldPushBook(makeBook({ seriesId: "abc", chapterStatus: "fetched", lastRead: 1000 })),
		).toBe(true);
	});

	it("includes locked chapter", () => {
		expect(
			shouldPushBook(makeBook({ seriesId: "abc", chapterStatus: "locked", lastRead: 1000 })),
		).toBe(true);
	});

	it("always includes deleted chapter (tombstone must propagate)", () => {
		expect(
			shouldPushBook(makeBook({ seriesId: "abc", chapterStatus: "pending", deleted: true })),
		).toBe(true);
	});

	it("always includes standalone book regardless of chapterStatus", () => {
		expect(shouldPushBook(makeBook({ seriesId: null, chapterStatus: "pending" }))).toBe(true);
	});
});
