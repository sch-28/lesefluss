import { describe, expect, it } from "vitest";
import type { CatalogBook } from "../../../services/catalog/client";
import { catalogFacts } from "../catalog-facts";

const base: CatalogBook = {
	id: "gutenberg:84",
	source: "gutenberg",
	title: "Frankenstein",
	author: "Shelley, Mary Wollstonecraft",
	language: "en",
	subjects: [],
	summary: null,
	description: null,
	epubUrl: "https://x.test/84.epub",
	coverUrl: null,
};

describe("catalogFacts", () => {
	it("shows language, source and author years when known, leaving length to the length fact", () => {
		expect(
			catalogFacts({ ...base, wordCount: 75_000, authorBirthYear: 1797, authorDeathYear: 1851 }),
		).toEqual(["English", "Project Gutenberg", "Author 1797–1851"]);
	});

	it("leaves out what the catalog doesn't know", () => {
		expect(catalogFacts({ ...base, language: null, wordCount: null })).toEqual([
			"Project Gutenberg",
		]);
	});

	it("handles half-known author years and a missing EPUB", () => {
		expect(catalogFacts({ ...base, authorBirthYear: 1850, epubUrl: null })).toEqual([
			"English",
			"Project Gutenberg",
			"Author b. 1850",
			"No free EPUB",
		]);
	});
});
