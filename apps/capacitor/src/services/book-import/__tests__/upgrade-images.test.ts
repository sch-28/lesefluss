// @vitest-environment node
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

const reparsed = vi.hoisted(() => ({
	content: "",
	images: [] as unknown[],
	imageAnchors: [] as unknown[],
}));
vi.mock("@lesefluss/book-import", async (importOriginal) => ({
	...(await importOriginal<typeof import("@lesefluss/book-import")>()),
	runImportPipeline: vi.fn(async () => ({ ...reparsed, fileFormat: "epub", title: "t" })),
}));
vi.mock("../sources/read-file", () => ({
	readOriginalFile: vi.fn(async () => new ArrayBuffer(4)),
}));
vi.mock("../store-images", () => ({
	storeBookImages: vi.fn(async () => 1),
	patchCachedAnchors: vi.fn(),
}));
vi.mock("../../telemetry", () => ({
	reportEvent: vi.fn(),
	errorMessage: (e: unknown) => String(e),
}));
vi.mock("../../query-client", () => ({
	queryClient: { setQueryData: vi.fn(), invalidateQueries: vi.fn() },
}));

const { needsImageUpgrade, upgradeBookImages } = await import("../upgrade-images");
const { addBookWithContent, getBookContent, getBookImages } = await import(
	"../../db/queries/books"
);
const { WordIndex } = await import("@lesefluss/core");
const { storeBookImages } = await import("../store-images");

const CONTENT = "# One\n\nFirst paragraph here.";

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

beforeEach(() => {
	isNative = true;
	raw.exec("DELETE FROM book_images; DELETE FROM book_content; DELETE FROM books;");
	vi.mocked(storeBookImages).mockClear();
});

describe("needsImageUpgrade", () => {
	const epub = { fileFormat: "epub", filePath: "books/a.epub" };

	it("wants an EPUB with its file on disk and no anchor column yet", () => {
		expect(needsImageUpgrade(epub, null)).toBe(true);
	});

	it("leaves checked books alone, with or without images", () => {
		expect(needsImageUpgrade(epub, "[]")).toBe(false);
		expect(needsImageUpgrade(epub, '[{"word":0,"key":"/i/a.png","alt":""}]')).toBe(false);
	});

	it("skips other formats, books without an original file, and the web build", () => {
		expect(needsImageUpgrade({ fileFormat: "txt", filePath: "books/a.txt" }, null)).toBe(false);
		expect(needsImageUpgrade({ fileFormat: "epub", filePath: null }, null)).toBe(false);
		isNative = false;
		expect(needsImageUpgrade(epub, null)).toBe(false);
	});
});

describe("upgradeBookImages", () => {
	it("adds anchors and stores images when the re-parsed text matches", async () => {
		await addBookWithContent(book("m1"), CONTENT, null, null, null, null);
		reparsed.content = CONTENT;
		reparsed.images = [
			{
				key: "/i/a.png",
				mime: "image/png",
				dataUrl: "data:image/png;base64,QUJD",
				width: 1,
				height: 1,
				isLineArt: false,
			},
		];
		reparsed.imageAnchors = [{ key: "/i/a.png", alt: "", startByte: 7 }];
		await upgradeBookImages(
			{ id: "m1", filePath: "books/m1.epub" },
			CONTENT,
			WordIndex.build(CONTENT),
		);
		expect(JSON.parse((await getBookContent("m1"))?.imageAnchors ?? "null")).toEqual([
			{ word: 1, key: "/i/a.png", alt: "" },
		]);
		expect(storeBookImages).toHaveBeenCalledWith(
			"m1",
			reparsed.images,
			"book_images_upgrade_error",
		);
	});

	it("marks the book checked and stores nothing when the text differs", async () => {
		await addBookWithContent(book("m2"), CONTENT, null, null, null, null);
		reparsed.content = "something else";
		reparsed.images = [];
		reparsed.imageAnchors = [];
		await upgradeBookImages(
			{ id: "m2", filePath: "books/m2.epub" },
			CONTENT,
			WordIndex.build(CONTENT),
		);
		expect((await getBookContent("m2"))?.imageAnchors).toBe("[]");
		expect(await getBookImages("m2")).toEqual([]);
		expect(storeBookImages).not.toHaveBeenCalled();
	});

	it("runs once per book per session", async () => {
		await addBookWithContent(book("m3"), CONTENT, null, null, null, null);
		reparsed.content = CONTENT;
		reparsed.images = [];
		reparsed.imageAnchors = [];
		await upgradeBookImages(
			{ id: "m3", filePath: "books/m3.epub" },
			CONTENT,
			WordIndex.build(CONTENT),
		);
		raw.exec("UPDATE book_content SET image_anchors = NULL WHERE book_id = 'm3'");
		await upgradeBookImages(
			{ id: "m3", filePath: "books/m3.epub" },
			CONTENT,
			WordIndex.build(CONTENT),
		);
		expect((await getBookContent("m3"))?.imageAnchors).toBeNull();
	});
});
