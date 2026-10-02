// @vitest-environment node
/**
 * Image anchors and rows written by `addBookWithContent`, against real SQLite.
 * The subject is the byte → word conversion and the delete paths, which a
 * mocked db could not answer.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "./test-db";

const { db, raw, close } = createTestDb();
vi.mock("../index", () => ({
	get db() {
		return db;
	},
}));
afterAll(close);

const {
	addBookImages,
	addBookWithContent,
	setBookImageAnchors,
	deleteBook,
	getBookContent,
	getBookImageData,
	getBookImages,
	hardDeleteBook,
} = await import("../queries/books");

const CONTENT = "# One\n\nFirst paragraph here.\n\nSecond paragraph here.";
const byteAt = (needle: string) => Buffer.byteLength(CONTENT.slice(0, CONTENT.indexOf(needle)));

function book(id: string) {
	return {
		id,
		title: "Pictures",
		fileFormat: "epub",
		size: Buffer.byteLength(CONTENT),
		isActive: false,
		addedAt: 1,
		updatedAt: 1,
		metadataUpdatedAt: 1,
	};
}

const IMAGES = [
	{
		key: "/i/map.png",
		mime: "image/png",
		dataUrl: "data:image/png;base64,QUJD",
		width: 2,
		height: 3,
		isLineArt: true,
	},
	{
		key: "/i/orn.png",
		mime: "image/png",
		dataUrl: "data:image/png;base64,REVG",
		width: 1,
		height: 1,
		isLineArt: false,
	},
];

beforeEach(() => {
	raw.exec("DELETE FROM book_images; DELETE FROM book_content; DELETE FROM books;");
});

describe("addBookWithContent images", () => {
	it("converts byte anchors to the first word at or after them", async () => {
		await addBookWithContent(book("b1"), CONTENT, null, null, null, [
			{ key: "/i/map.png", alt: "map", startByte: 0 }, // on the "# " marker → "One"
			{ key: "/i/orn.png", alt: "", startByte: byteAt("First") }, // word start
			{ key: "/i/orn.png", alt: "", startByte: byteAt("Second") - 2 }, // in the \n\n gap
			{ key: "/i/map.png", alt: "", startByte: Buffer.byteLength(CONTENT) }, // trailing
		]);
		const content = await getBookContent("b1");
		// Words: One(0) First(1) paragraph(2) here.(3) Second(4) paragraph(5) here.(6)
		expect(JSON.parse(content?.imageAnchors ?? "[]")).toEqual([
			{ word: 0, key: "/i/map.png", alt: "map" },
			{ word: 1, key: "/i/orn.png", alt: "" },
			{ word: 4, key: "/i/orn.png", alt: "" },
			{ word: 7, key: "/i/map.png", alt: "" },
		]);
		expect(content?.content).toBe(CONTENT);
	});

	it("stores one row per image with metadata and serves the data URL back", async () => {
		await addBookWithContent(book("b1"), CONTENT, null, null, null, [
			{ key: "/i/map.png", alt: "", startByte: 0 },
		]);
		expect(await addBookImages("b1", IMAGES)).toBe(2);
		const rows = await getBookImages("b1");
		expect(rows).toEqual([
			{ bookId: "b1", key: "/i/map.png", mime: "image/png", width: 2, height: 3, isLineArt: true },
			{ bookId: "b1", key: "/i/orn.png", mime: "image/png", width: 1, height: 1, isLineArt: false },
		]);
		expect(await getBookImageData("b1", "/i/map.png")).toBe("data:image/png;base64,QUJD");
		expect(await getBookImageData("b1", "/i/nope.png")).toBeNull();
	});

	it("stores [] for an EPUB without images and null when no anchors were offered", async () => {
		await addBookWithContent(book("b1"), CONTENT, null, null, null, []);
		expect((await getBookContent("b1"))?.imageAnchors).toBe("[]");
		expect(await getBookImages("b1")).toEqual([]);
		await addBookWithContent(book("b2"), CONTENT, null, null, null, null);
		expect((await getBookContent("b2"))?.imageAnchors).toBeNull();
	});

	it("removes image rows on soft and hard delete", async () => {
		const anchors = [{ key: "/i/map.png", alt: "", startByte: 0 }];
		await addBookWithContent(book("b1"), CONTENT, null, null, null, anchors);
		await addBookWithContent(book("b2"), CONTENT, null, null, null, anchors);
		await addBookImages("b1", IMAGES);
		await addBookImages("b2", IMAGES);
		await deleteBook("b1");
		await hardDeleteBook("b2");
		expect(await getBookImages("b1")).toEqual([]);
		expect(await getBookImages("b2")).toEqual([]);
	});

	it("stops writing images once the book is gone or tombstoned", async () => {
		await addBookWithContent(book("b1"), CONTENT, null, null, null, null);
		await deleteBook("b1");
		expect(await addBookImages("b1", IMAGES)).toBe(0);
		expect(await getBookImages("b1")).toEqual([]);

		await addBookWithContent(book("b2"), CONTENT, null, null, null, null);
		let written = 0;
		const count = await addBookImages("b2", IMAGES, async () => {
			written++;
			if (written === 1) await hardDeleteBook("b2");
		});
		// The delete itself removed the one row that had landed.
		expect(count).toBe(1);
		expect(await getBookImages("b2")).toEqual([]);
	});

	it("tolerates a row that already exists, as when a repair races the import write", async () => {
		await addBookWithContent(book("b1"), CONTENT, null, null, null, null);
		expect(await addBookImages("b1", IMAGES)).toBe(2);
		expect(await addBookImages("b1", IMAGES)).toBe(2);
		expect(await getBookImages("b1")).toHaveLength(2);
	});

	it("adds anchors to an existing book without touching the book row", async () => {
		const { WordIndex } = await import("@lesefluss/core");
		await addBookWithContent(book("b1"), CONTENT, null, null, null, null);
		const before = raw.prepare("select updated_at, word_position from books where id = 'b1'").get();
		await setBookImageAnchors(
			"b1",
			[{ key: "/i/map.png", alt: "map", startByte: byteAt("Second") - 2 }],
			WordIndex.build(CONTENT),
		);
		expect(JSON.parse((await getBookContent("b1"))?.imageAnchors ?? "[]")).toEqual([
			{ word: 4, key: "/i/map.png", alt: "map" },
		]);
		expect(
			raw.prepare("select updated_at, word_position from books where id = 'b1'").get(),
		).toEqual(before);

		await setBookImageAnchors("b1", [], WordIndex.build(CONTENT));
		expect((await getBookContent("b1"))?.imageAnchors).toBe("[]");
	});
});
