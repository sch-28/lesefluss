import { describe, expect, it } from "vitest";
import type { Book, BookContent } from "../../db/schema";
import { bookToSync } from "../index";

function makeBook(overrides: Partial<Book> = {}): Book {
	return {
		id: "deadbeef",
		title: "T",
		author: null,
		fileFormat: "txt",
		filePath: null,
		size: 0,
		position: 0,
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
};

describe("bookToSync", () => {
	it("includes content/coverImage/chapters for standalone books", () => {
		const out = bookToSync(makeBook(), content);
		expect(out.content).toBe("body text");
		expect(out.coverImage).toBe("cover-bytes");
		expect(out.chapters).toBe('[{"title":"a","startByte":0}]');
	});

	it("omits content/coverImage/chapters for chapter rows even when contentData is supplied", () => {
		const out = bookToSync(makeBook({ seriesId: "abc12345", chapterIndex: 0 }), content);
		expect(out).not.toHaveProperty("content");
		expect(out).not.toHaveProperty("coverImage");
		expect(out).not.toHaveProperty("chapters");
		// Lightweight chapter metadata still flows through.
		expect(out.seriesId).toBe("abc12345");
		expect(out.chapterIndex).toBe(0);
	});

	it("omits content for tombstoned books", () => {
		const out = bookToSync(makeBook({ deleted: true }), content);
		expect(out).not.toHaveProperty("content");
	});
});
