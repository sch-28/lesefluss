import { describe, expect, it } from "vitest";
import { bookFormatForFileName } from "../utils/file-format";

describe("bookFormatForFileName", () => {
	it("maps every importable extension", () => {
		expect(bookFormatForFileName("a.txt")).toBe("txt");
		expect(bookFormatForFileName("a.md")).toBe("md");
		expect(bookFormatForFileName("a.epub")).toBe("epub");
		expect(bookFormatForFileName("a.html")).toBe("html");
		expect(bookFormatForFileName("a.htm")).toBe("html");
		expect(bookFormatForFileName("a.pdf")).toBe("pdf");
	});

	it("ignores extension case", () => {
		expect(bookFormatForFileName("Morning Star.EPub")).toBe("epub");
	});

	it("reads only the last extension", () => {
		expect(bookFormatForFileName("archive.epub.bak")).toBeNull();
		expect(bookFormatForFileName("Vol 1.2.epub")).toBe("epub");
	});

	it("returns null for extensions that name an Object.prototype member", () => {
		expect(bookFormatForFileName("notes.constructor")).toBeNull();
		expect(bookFormatForFileName("notes.__proto__")).toBeNull();
	});

	it("returns null without a usable extension", () => {
		expect(bookFormatForFileName("README")).toBeNull();
		expect(bookFormatForFileName(".epub")).toBeNull();
		expect(bookFormatForFileName("cover.jpg")).toBeNull();
	});
});
