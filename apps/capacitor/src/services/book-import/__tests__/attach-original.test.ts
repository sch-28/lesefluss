// @vitest-environment node
import type { BookPayload } from "@lesefluss/book-import";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../../db/__tests__/test-db";

const { db, raw, close } = createTestDb();
vi.mock("../../db/index", () => ({
	get db() {
		return db;
	},
}));
afterAll(close);

let isNative = true;
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => isNative } }));
const fs = vi.hoisted(() => ({
	mkdir: vi.fn(async () => {}),
	writeFile: vi.fn(async () => {}),
	appendFile: vi.fn(async () => {}),
	deleteFile: vi.fn(async () => {}),
}));
vi.mock("@capacitor/filesystem", () => ({ Directory: { Data: "DATA" }, Filesystem: fs }));
vi.mock("../store-images", () => ({
	storeBookImages: vi.fn(async () => 1),
	patchCachedAnchors: vi.fn(),
}));
vi.mock("../../telemetry", () => ({
	reportEvent: vi.fn(),
	errorMessage: (e: unknown) => String(e),
}));

const { attachOriginalToBook, findAttachCandidate } = await import("../attach-original");
const { saveOriginalFile } = await import("../commit");
const { queries } = await import("../../db/queries");
const { addBookWithContent, deleteBook, getBook, getBookContent } = await import(
	"../../db/queries/books"
);
const { patchCachedAnchors, storeBookImages } = await import("../store-images");
const { reportEvent } = await import("../../telemetry");

const CONTENT = "# One\n\nFirst paragraph here.\n\nSecond paragraph there.";
const IMAGE = {
	key: "/i/a.png",
	mime: "image/png",
	dataUrl: "data:image/png;base64,QUJD",
	width: 1,
	height: 1,
	isLineArt: false,
};
const ANCHORS_JSON = JSON.stringify([{ word: 1, key: "/i/a.png", alt: "" }]);

function payload(overrides: Partial<BookPayload> = {}): BookPayload {
	return {
		title: "Pictures",
		fileFormat: "epub",
		content: CONTENT,
		images: [IMAGE],
		imageAnchors: [{ key: "/i/a.png", alt: "", startByte: 7 }],
		original: { bytes: new ArrayBuffer(3), extension: "epub" },
		...overrides,
	};
}

/** A book as the sync pull writes it: text only, no original file. */
function syncedBook(id: string, overrides: Record<string, unknown> = {}) {
	return {
		id,
		title: "Pictures",
		fileFormat: "txt",
		filePath: null,
		size: Buffer.byteLength(CONTENT),
		isActive: false,
		addedAt: 1,
		updatedAt: 1,
		metadataUpdatedAt: 1,
		...overrides,
	};
}

const seed = (id: string, content = CONTENT, overrides: Record<string, unknown> = {}) =>
	addBookWithContent(syncedBook(id, overrides), content, null, null, null, null);

beforeEach(() => {
	isNative = true;
	raw.exec("DELETE FROM book_images; DELETE FROM book_content; DELETE FROM books;");
	vi.mocked(storeBookImages).mockClear();
	vi.mocked(patchCachedAnchors).mockClear();
	vi.mocked(reportEvent).mockClear();
	fs.writeFile.mockReset().mockResolvedValue(undefined);
	vi.restoreAllMocks();
});

describe("findAttachCandidate", () => {
	it("finds the synced book with the same text", async () => {
		await seed("s1");
		expect((await findAttachCandidate(payload()))?.id).toBe("s1");
	});

	it("ignores books that already have their original file", async () => {
		await seed("s2", CONTENT, { filePath: "books/s2.epub" });
		expect(await findAttachCandidate(payload())).toBeNull();
	});

	it("rejects a different text of the same length without reading other lengths", async () => {
		await seed("s3", CONTENT.replace("First", "Firzt"));
		await seed("s4", "short", { size: 5 });
		const read = vi.spyOn(queries, "getBookContent");
		expect(await findAttachCandidate(payload())).toBeNull();
		expect(read.mock.calls.map(([id]) => id)).toEqual(["s3"]);
	});

	it("falls back to the word count for a legacy row without a size", async () => {
		await seed("s5", CONTENT, { size: 0 });
		await seed("s6", "one two three", { size: 0 });
		const read = vi.spyOn(queries, "getBookContent");
		expect((await findAttachCandidate(payload()))?.id).toBe("s5");
		expect(read.mock.calls.map(([id]) => id)).toEqual(["s5"]);
	});

	it("skips a deleted book and a book whose file copy is still being written", async () => {
		await seed("s7");
		await deleteBook("s7");
		expect(await findAttachCandidate(payload())).toBeNull();

		await seed("s8");
		let finishWrite = () => {};
		fs.writeFile.mockImplementationOnce(() => new Promise<void>((r) => (finishWrite = r)));
		const saving = saveOriginalFile("s8", { bytes: new ArrayBuffer(3), extension: "epub" });
		expect(await findAttachCandidate(payload())).toBeNull();
		finishWrite();
		await saving;
	});

	it("only ever attaches EPUBs", async () => {
		await seed("s9");
		expect(await findAttachCandidate(payload({ fileFormat: "txt" }))).toBeNull();
	});

	it("on the web build does not offer a book that already has images", async () => {
		isNative = false;
		await seed("s10");
		raw.exec(`UPDATE book_content SET image_anchors = '${ANCHORS_JSON}' WHERE book_id = 's10'`);
		expect(await findAttachCandidate(payload())).toBeNull();
		raw.exec("UPDATE book_content SET image_anchors = '[]' WHERE book_id = 's10'");
		expect((await findAttachCandidate(payload()))?.id).toBe("s10");
	});
});

describe("attachOriginalToBook", () => {
	it("writes anchors, stores images and records the file without touching progress", async () => {
		await seed("a1");
		raw.exec(
			"UPDATE books SET word_position = 3, updated_at = 500, metadata_updated_at = 400 WHERE id = 'a1'",
		);

		const result = await attachOriginalToBook({ id: "a1" }, payload(), {
			awaitBackgroundWork: true,
		});

		expect(result).toEqual({ fileCopyFailed: false });
		expect((await getBookContent("a1"))?.imageAnchors).toBe(ANCHORS_JSON);
		expect(patchCachedAnchors).toHaveBeenCalledWith("a1", ANCHORS_JSON);
		expect(storeBookImages).toHaveBeenCalledWith("a1", [IMAGE], "book_images_attach_error");
		const book = await getBook("a1");
		expect(book?.filePath).toBe("books/a1.epub");
		expect(book?.fileFormat).toBe("epub");
		expect(book?.wordPosition).toBe(3);
		expect(book?.updatedAt).toBe(500);
		expect(book?.metadataUpdatedAt).toBe(400);
	});

	it("keeps the images and reports when the file copy fails", async () => {
		await seed("a2");
		fs.writeFile.mockRejectedValueOnce(new Error("disk full"));
		const result = await attachOriginalToBook({ id: "a2" }, payload());
		expect(result).toEqual({ fileCopyFailed: true });
		expect(reportEvent).toHaveBeenCalledWith("book_original_attach_error");
		expect((await getBookContent("a2"))?.imageAnchors).toBe(ANCHORS_JSON);
		const book = await getBook("a2");
		expect(book?.filePath).toBeNull();
		expect(book?.fileFormat).toBe("txt");
	});

	it("skips the file copy on the web build and still writes anchors", async () => {
		isNative = false;
		await seed("a3");
		await attachOriginalToBook({ id: "a3" }, payload(), { awaitBackgroundWork: true });
		expect((await getBookContent("a3"))?.imageAnchors).toBe(ANCHORS_JSON);
		expect(fs.writeFile).not.toHaveBeenCalled();
		const book = await getBook("a3");
		expect(book?.filePath).toBeNull();
		expect(book?.fileFormat).toBe("txt");
	});

	it("marks a book without images as checked and stores nothing", async () => {
		await seed("a4");
		await attachOriginalToBook({ id: "a4" }, payload({ images: [], imageAnchors: [] }));
		expect((await getBookContent("a4"))?.imageAnchors).toBe("[]");
		expect(storeBookImages).not.toHaveBeenCalled();
	});

	it("refuses a book that has no word index", async () => {
		await expect(attachOriginalToBook({ id: "missing" }, payload())).rejects.toThrow(
			"no word index",
		);
	});
});
