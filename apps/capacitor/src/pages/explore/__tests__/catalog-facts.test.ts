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
	it("shows length, reading time, language, source and author years when known", () => {
		expect(
			catalogFacts(
				{ ...base, wordCount: 75_000, authorBirthYear: 1797, authorDeathYear: 1851 },
				300,
			),
		).toEqual([
			"75,000 words",
			"4h 10m at 300 wpm",
			"English",
			"Project Gutenberg",
			"Author 1797–1851",
		]);
	});

	it("leaves out what the catalog doesn't know", () => {
		expect(catalogFacts({ ...base, language: null, wordCount: null }, 300)).toEqual([
			"Project Gutenberg",
		]);
	});

	it("handles half-known author years and a missing EPUB", () => {
		expect(catalogFacts({ ...base, authorBirthYear: 1850, epubUrl: null }, 300)).toEqual([
			"English",
			"Project Gutenberg",
			"Author b. 1850",
			"No free EPUB",
		]);
	});
});
