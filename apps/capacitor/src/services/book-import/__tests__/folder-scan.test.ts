import { describe, expect, it } from "vitest";
import { toScannedFiles } from "../sources/folder-scan";

function candidate(relativePath: string, size = 100) {
	const name = relativePath.slice(relativePath.lastIndexOf("/") + 1);
	return {
		relativePath,
		name,
		size,
		handle: { kind: "uri" as const, uri: `content://tree/${relativePath}` },
	};
}

describe("toScannedFiles", () => {
	it("keeps every supported format and tags it", () => {
		const files = toScannedFiles([
			candidate("a.epub"),
			candidate("b.pdf"),
			candidate("c.txt"),
			candidate("d.md"),
			candidate("e.html"),
			candidate("f.htm"),
		]);
		expect(files.map((f) => f.format)).toEqual(["epub", "pdf", "txt", "md", "html", "html"]);
	});

	it("drops unsupported extensions and extensionless files", () => {
		const files = toScannedFiles([
			candidate("cover.jpg"),
			candidate("metadata.opf"),
			candidate("README"),
			candidate("book.epub"),
		]);
		expect(files.map((f) => f.name)).toEqual(["book.epub"]);
	});

	// Calibre and macOS both litter libraries with these.
	it("drops dotfiles even when the extension is supported", () => {
		const files = toScannedFiles([candidate(".hidden.epub"), candidate("book.epub")]);
		expect(files.map((f) => f.name)).toEqual(["book.epub"]);
	});

	it("matches extensions case-insensitively", () => {
		const files = toScannedFiles([candidate("Loud.EPUB"), candidate("Shout.PDF")]);
		expect(files.map((f) => f.format)).toEqual(["epub", "pdf"]);
	});

	// A Calibre library is one folder per book, so the nesting is the only thing
	// telling two identically-named files apart.
	it("preserves nested paths and sorts by them", () => {
		const files = toScannedFiles([
			candidate("Zola/Nana.epub"),
			candidate("Brown/Morning Star.epub"),
			candidate("Brown/Red Rising.epub"),
		]);
		expect(files.map((f) => f.relativePath)).toEqual([
			"Brown/Morning Star.epub",
			"Brown/Red Rising.epub",
			"Zola/Nana.epub",
		]);
	});

	// Oversized files stay in the list: the batch runner reports them as a per-file
	// failure at read time, rather than the scan silently losing them.
	it("keeps files that exceed the import size cap", () => {
		const files = toScannedFiles([candidate("huge.epub", 500 * 1024 * 1024)]);
		expect(files).toHaveLength(1);
	});

	// A browser that ignores `webkitdirectory` reports no relative path, so a
	// multi-select can yield two files with the same name. Sharing an id would
	// stamp one file's probe onto the other and toggle both from one tap.
	it("gives same-named files distinct ids", () => {
		const files = toScannedFiles([candidate("Dune.epub"), candidate("Dune.epub")]);
		expect(files).toHaveLength(2);
		expect(files[0].id).not.toBe(files[1].id);
	});

	// Sorting must not shuffle a handle onto a different book.
	it("keeps each handle with its own file across the sort", () => {
		const files = toScannedFiles([candidate("Zola/Nana.epub"), candidate("Brown/Red Rising.epub")]);
		expect(files.map((f) => f.handle)).toEqual([
			{ kind: "uri", uri: "content://tree/Brown/Red Rising.epub" },
			{ kind: "uri", uri: "content://tree/Zola/Nana.epub" },
		]);
	});
});
