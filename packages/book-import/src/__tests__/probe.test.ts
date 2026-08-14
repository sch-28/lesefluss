// @vitest-environment jsdom
// happy-dom (the suite default) returns nothing from `book.packaging.metadata`,
// so every title here would silently fall back to the filename and the
// probe-matches-parse assertion would pass without testing anything.
import { describe, expect, it } from "vitest";
import { epubParser } from "../parsers/epub";
import { htmlParser } from "../parsers/html";
import { probeBookMetadata } from "../probe";
import { buildEpub } from "../test-fixtures/build-epub";
import type { PdfjsModuleLike } from "../types";

const chapters = [{ id: "c1", href: "c1.xhtml", title: "One", body: "<p>Hello.</p>" }];

function bytesOf(text: string): ArrayBuffer {
	return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

/** Stands in for pdfjs so the info-dictionary handling is testable without
 *  hand-rolling a PDF. `getPage` is deliberately absent: a probe that reaches
 *  for a page should fail this test rather than quietly render a cover. */
function stubPdfjs(info: { Title?: string; Author?: string } | null): PdfjsModuleLike {
	return {
		getDocument: () => ({
			promise: Promise.resolve({
				getMetadata: async () => ({ info }),
				destroy: async () => undefined,
			}),
		}),
	};
}

describe("probeBookMetadata", () => {
	// Asserted against the full parser rather than literals: if the two ever
	// diverge, the review screen would promise a book the import doesn't deliver.
	it("reports the same title, author, and cover as a full EPUB parse", async () => {
		const bytes = await buildEpub({
			title: "Morning Star",
			creator: "Pierce Brown",
			cover: "epub3-property",
			chapters,
		});
		const parsed = await epubParser.parse({ kind: "bytes", bytes, fileName: "ms.epub" });
		const probed = await probeBookMetadata({ kind: "bytes", bytes, fileName: "ms.epub" });

		expect(probed.title).toBe(parsed.title);
		expect(probed.author).toBe(parsed.author);
		expect(probed.coverImage).toBe(parsed.coverImage);
		expect(probed.format).toBe("epub");
	});

	it("falls back to the filename when an EPUB declares no title", async () => {
		const bytes = await buildEpub({ title: "", creator: "Pierce Brown", chapters });
		const probed = await probeBookMetadata({
			kind: "bytes",
			bytes,
			fileName: "Red Rising.epub",
		});
		expect(probed.title).toBe("Red Rising");
		// Only the real parser can produce this; the catch-all fallback has a null
		// author, so without it the assertion above passes even when probeEpub throws.
		expect(probed.author).toBe("Pierce Brown");
	});

	it("returns a name-only probe for bytes that are not an EPUB", async () => {
		const probed = await probeBookMetadata({
			kind: "bytes",
			bytes: bytesOf("not a zip at all"),
			fileName: "broken.epub",
		});
		expect(probed).toEqual({
			title: "broken",
			author: null,
			coverImage: null,
			format: "epub",
		});
	});

	// A truncated file keeps a valid zip header, so epubjs accepts it and then
	// never settles; the probe waits out the 15s ready timeout before falling
	// back, which is what the budget below covers.
	it("returns a name-only probe for a truncated EPUB", async () => {
		const full = await buildEpub({ title: "Whole", chapters });
		const probed = await probeBookMetadata({
			kind: "bytes",
			bytes: full.slice(0, 64),
			fileName: "cut.epub",
		});
		expect(probed.title).toBe("cut");
		expect(probed.coverImage).toBeNull();
	}, 25_000);

	for (const [fileName, expectedTitle] of [
		["notes.txt", "notes"],
		["reading-list.md", "reading-list"],
	] as const) {
		it(`derives ${fileName}'s title from its name and reports no cover`, async () => {
			const probed = await probeBookMetadata({
				kind: "bytes",
				bytes: bytesOf("# Heading\n\nbody"),
				fileName,
			});
			expect(probed.title).toBe(expectedTitle);
			expect(probed.author).toBeNull();
			expect(probed.coverImage).toBeNull();
		});
	}

	// The parser reads <title>, so a filename here would mean the review screen
	// shows one name and the library shows another after import.
	it("reads an HTML document's title rather than its filename", async () => {
		const html = "<html><head><title>How Sorting Works</title></head><body><p>x</p></body></html>";
		const probed = await probeBookMetadata({
			kind: "bytes",
			bytes: bytesOf(html),
			fileName: "article.html",
		});
		expect(probed.title).toBe("How Sorting Works");
		expect(probed.coverImage).toBeNull();
	});

	it("agrees with the HTML parser on the title of a titled document", async () => {
		const html =
			"<html><head><title>How Sorting Works</title></head><body><p>Body.</p></body></html>";
		const input = { kind: "bytes", bytes: bytesOf(html), fileName: "article.html" } as const;
		const parsed = await htmlParser.parse(input);
		const probed = await probeBookMetadata(input);
		expect(probed.title).toBe(parsed.title);
	});

	// A filename here would not just mislabel the card: the probed title is what
	// the duplicate check compares, so it would never match the row the import
	// creates and the reader would be offered a book they already have.
	it("agrees with the HTML parser on a document with no title element", async () => {
		const input = {
			kind: "bytes",
			bytes: bytesOf("<html><body><p>No title element.</p></body></html>"),
			fileName: "orphan.htm",
		} as const;
		const parsed = await htmlParser.parse(input);
		const probed = await probeBookMetadata(input);

		expect(probed.title).toBe(parsed.title);
		expect(probed.title).not.toBe("orphan");
	});

	// `deriveTitle` stamps the current time when the text opens with prose. The
	// probe must not reach that branch: a scan previewing a file and an import
	// committing it minutes later would stamp different minutes, and no
	// normalisation could ever make the two compare equal.
	it("uses the filename rather than a timestamp when a title-less document opens with prose", async () => {
		const prose =
			"This opening paragraph runs well past eighty characters, which is what makes it read as prose rather than as a heading.";
		const probed = await probeBookMetadata({
			kind: "bytes",
			bytes: bytesOf(`<html><body><p>${prose}</p></body></html>`),
			fileName: "essay.html",
		});
		expect(probed.title).toBe("essay");
		expect(probed.title).not.toMatch(/Pasted text/);
	});

	it("falls back to the filename for an HTML document with no title and no text", async () => {
		const probed = await probeBookMetadata({
			kind: "bytes",
			bytes: bytesOf("<html><body></body></html>"),
			fileName: "empty.htm",
		});
		expect(probed.title).toBe("empty");
	});

	it("reads a PDF's title and author from the info dictionary", async () => {
		const probed = await probeBookMetadata(
			{ kind: "bytes", bytes: bytesOf("%PDF-1.4"), fileName: "paper.pdf" },
			{ loadPdfjs: async () => stubPdfjs({ Title: "  On Sorting  ", Author: " Knuth " }) },
		);
		expect(probed).toEqual({
			title: "On Sorting",
			author: "Knuth",
			coverImage: null,
			format: "pdf",
		});
	});

	it("falls back to the filename when a PDF declares no title", async () => {
		const probed = await probeBookMetadata(
			{ kind: "bytes", bytes: bytesOf("%PDF-1.4"), fileName: "scan-2019.pdf" },
			// The author is present so the assertion cannot be satisfied by the
			// catch-all fallback, which would report a null author.
			{ loadPdfjs: async () => stubPdfjs({ Author: "Knuth" }) },
		);
		expect(probed.title).toBe("scan-2019");
		expect(probed.author).toBe("Knuth");
	});

	it("falls back to the filename when a PDF has no info dictionary at all", async () => {
		const probed = await probeBookMetadata(
			{ kind: "bytes", bytes: bytesOf("%PDF-1.4"), fileName: "scan-2019.pdf" },
			{ loadPdfjs: async () => stubPdfjs(null) },
		);
		expect(probed.title).toBe("scan-2019");
		expect(probed.author).toBeNull();
	});

	// The spine walk is the whole cost of an EPUB parse, and skipping it is the
	// only reason a scan of hundreds of files is viable.
	it("probes an EPUB faster than parsing it", async () => {
		const many = Array.from({ length: 120 }, (_, i) => ({
			id: `c${i}`,
			href: `c${i}.xhtml`,
			title: `Chapter ${i}`,
			body: `<p>${"Body text. ".repeat(40)}</p>`,
		}));
		const bytes = await buildEpub({ title: "Long", chapters: many });

		const parseStart = performance.now();
		const parsed = await epubParser.parse({ kind: "bytes", bytes, fileName: "long.epub" });
		const parseMs = performance.now() - parseStart;

		const probeStart = performance.now();
		const probed = await probeBookMetadata({ kind: "bytes", bytes, fileName: "long.epub" });
		const probeMs = performance.now() - probeStart;

		expect(parsed.chapters).toHaveLength(120);
		expect(probed.title).toBe("Long");
		expect(probeMs).toBeLessThan(parseMs);
	}, 30_000);

	it("keeps the whole name when the extension is not a book format", async () => {
		const probed = await probeBookMetadata({
			kind: "bytes",
			bytes: bytesOf("x"),
			fileName: "archive.tar.gz",
		});
		expect(probed).toEqual({
			title: "archive.tar.gz",
			author: null,
			coverImage: null,
			format: null,
		});
	});
});
