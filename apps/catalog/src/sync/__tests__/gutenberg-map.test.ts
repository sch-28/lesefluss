import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mapBook } from "../gutenberg-map.js";
import { parseGutenbergRdf } from "../gutenberg-rdf.js";

const fixture = (name: string) =>
	readFileSync(new URL(`./fixtures/rdf/${name}`, import.meta.url), "utf8");

function record(name: string) {
	const r = parseGutenbergRdf(fixture(name));
	if (!r) throw new Error(`${name} has no ebook`);
	return r;
}

describe("parseGutenbergRdf", () => {
	it("reads a real catalog entry: authors with years, LCSH subjects, shelves, summary, files", () => {
		const r = record("pg84.rdf");
		expect(r.id).toBe(84);
		expect(r.title).toBe("Frankenstein; or, the modern prometheus");
		expect(r.authors).toEqual([
			{ name: "Shelley, Mary Wollstonecraft", birthYear: 1797, deathYear: 1851 },
		]);
		expect(r.language).toBe("en");
		expect(r.subjects).toContain("Gothic fiction");
		// LCC classification codes are not subjects.
		expect(r.subjects).not.toContain("PR");
		expect(r.bookshelves).toContain("Gothic Fiction");
		expect(r.downloadCount).toBe(144008);
		expect(r.summary).toMatch(/^"Frankenstein; Or, The Modern Prometheus" by Mary/);
		expect(r.epubUrl).toBe("https://www.gutenberg.org/ebooks/84.epub3.images");
		expect(r.coverUrl).toBe("https://www.gutenberg.org/cache/epub/84/pg84.cover.medium.jpg");
		expect(r.type).toBe("Text");
	});

	it("handles several authors, a non-English book, a subtitle line and no cover", () => {
		const r = record("pg1257.rdf");
		expect(r.authors).toEqual([
			{ name: "Dumas, Alexandre", birthYear: 1802, deathYear: 1870 },
			{ name: "Maquet, Auguste", birthYear: 1813, deathYear: null },
		]);
		expect(r.language).toBe("fr");
		expect(r.title).toBe("Les trois mousquetaires: $b roman");
		expect(r.epubUrl).toBe("https://www.gutenberg.org/ebooks/1257.epub.noimages");
		expect(r.coverUrl).toBeUndefined();
	});

	it("decodes numeric character references and joins a CR-separated subtitle", () => {
		expect(parseGutenbergRdf(fixture("pg99002.rdf"))?.title).toBe(
			"The Works of Robert G. Ingersoll, Vol. 05 (of 12): Dresden Edition\u2014Discussions",
		);
	});

	it("sorts subjects and shelves so a reordered file is not a change", () => {
		const r = record("pg84.rdf");
		expect(r.subjects).toEqual([...r.subjects].sort());
		expect(r.bookshelves).toEqual([...r.bookshelves].sort());
	});

	it("throws on a truncated file", () => {
		expect(() => parseGutenbergRdf(fixture("broken.rdf"))).toThrow();
	});

	it("tolerates an entry with nearly nothing in it", () => {
		expect(parseGutenbergRdf(fixture("pg99001.rdf"))).toEqual({
			id: 99001,
			title: "An Untitled Pamphlet",
			authors: [],
			subjects: [],
			bookshelves: [],
			language: undefined,
			summary: undefined,
			epubUrl: undefined,
			coverUrl: undefined,
			downloadCount: undefined,
			type: "Text",
		});
	});

	it("reports the media type so audio books can be skipped, and ignores non-book files", () => {
		expect(parseGutenbergRdf(fixture("pg19159.rdf"))?.type).toBe("Sound");
		expect(parseGutenbergRdf(fixture("not-a-book.rdf"))).toBeNull();
	});
});

describe("mapBook from RDF", () => {
	it("maps a catalog entry to a normalized row with tags and author keys", () => {
		const mapped = mapBook(record("pg84.rdf"));
		expect(mapped?.row).toMatchObject({
			id: "gutenberg:84",
			source: "gutenberg",
			title: "Frankenstein; or, the modern prometheus",
			author: "Shelley, Mary Wollstonecraft",
			language: "en",
			authorBirthYear: 1797,
			authorDeathYear: 1851,
			authorKeys: ["mary shelley"],
			epubUrl: "https://www.gutenberg.org/ebooks/84.epub3.images",
			coverUrl: "https://www.gutenberg.org/cache/epub/84/pg84.cover.medium.jpg",
			downloadCount: 144008,
		});
		expect(mapped?.row.tags).toEqual(
			expect.arrayContaining(["science-fiction", "horror", "gothic-fiction", "fiction"]),
		);
		expect(mapped?.row.bookshelves).toContain("Gothic Fiction");
		expect(mapped?.row.summary).toMatch(/Gothic novel/);
	});

	it("cleans MARC title markers and keeps one key per author", () => {
		const mapped = mapBook(record("pg1257.rdf"));
		expect(mapped?.row.title).toBe("Les trois mousquetaires: roman");
		expect(mapped?.row.author).toBe("Dumas, Alexandre, Maquet, Auguste");
		expect(mapped?.row.authorKeys).toEqual(["alexandre dumas", "auguste maquet"]);
		expect(mapped?.row.coverUrl).toBeNull();
	});

	it("leaves a missing summary null so the upsert can keep the stored one", () => {
		const mapped = mapBook(record("pg99001.rdf"));
		expect(mapped?.row.summary).toBeNull();
		expect(mapped?.row.tags).toEqual([]);
	});
});
