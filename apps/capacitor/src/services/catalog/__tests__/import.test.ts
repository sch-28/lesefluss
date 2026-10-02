import { beforeEach, describe, expect, it, vi } from "vitest";

const getBookByCatalogId = vi.hoisted(() => vi.fn());
const getCatalogBook = vi.hoisted(() => vi.fn());
const downloadCatalogEpub = vi.hoisted(() => vi.fn());
const importBookFromBlob = vi.hoisted(() => vi.fn());

vi.mock("../../db/queries", () => ({ queries: { getBookByCatalogId } }));
vi.mock("../../book-import", () => ({ importBookFromBlob }));
vi.mock("../client", () => ({ getCatalogBook, downloadCatalogEpub }));

const { importFromCatalog } = await import("../import");

beforeEach(() => {
	vi.clearAllMocks();
	getBookByCatalogId.mockResolvedValue(null);
	getCatalogBook.mockResolvedValue({
		id: "gutenberg:84",
		source: "gutenberg",
		title: "Frankenstein",
		language: "en",
		epubUrl: "https://x.test/84.epub",
	});
	downloadCatalogEpub.mockResolvedValue(new Blob(["epub"]));
	importBookFromBlob.mockResolvedValue({ id: "local1" });
});

describe("importFromCatalog", () => {
	it("shares one import between concurrent calls for the same book", async () => {
		const [a, b] = await Promise.all([
			importFromCatalog("gutenberg:84"),
			importFromCatalog("gutenberg:84"),
		]);
		expect(importBookFromBlob).toHaveBeenCalledTimes(1);
		expect(a).toBe(b);
	});

	it("starts a fresh import once the previous one settled", async () => {
		await importFromCatalog("gutenberg:84");
		getBookByCatalogId.mockResolvedValue({ id: "local1" });
		const again = await importFromCatalog("gutenberg:84");
		expect(again.existed).toBe(true);
		expect(getBookByCatalogId).toHaveBeenCalledTimes(2);
	});

	it("lets a failed import be retried", async () => {
		downloadCatalogEpub.mockRejectedValueOnce(new Error("EPUB download failed (502)"));
		await expect(importFromCatalog("gutenberg:84")).rejects.toThrow("502");
		await expect(importFromCatalog("gutenberg:84")).resolves.toMatchObject({ existed: false });
	});
});
