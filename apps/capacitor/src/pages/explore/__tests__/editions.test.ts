import { describe, expect, it } from "vitest";
import type { CatalogSearchResult } from "../../../services/catalog/client";
import { collapseEditions, editionKey } from "../editions";

const r = (id: string, title: string, author: string | null): CatalogSearchResult => ({
	id,
	source: "gutenberg",
	title,
	author,
	language: "en",
	subjects: [],
	summary: null,
	coverUrl: null,
});

describe("editionKey", () => {
	it("matches editions of one work across sources and name orders", () => {
		const se = editionKey("Frankenstein", "Mary Shelley");
		expect(
			editionKey("Frankenstein; Or, The Modern Prometheus", "Mary Wollstonecraft Shelley"),
		).toBe(se);
		expect(
			editionKey("Frankenstein: Or, The Modern Prometheus", "Shelley, Mary Wollstonecraft"),
		).toBe(se);
	});

	it("keeps different works and different authors apart", () => {
		expect(editionKey("The Last Man", "Mary Shelley")).not.toBe(
			editionKey("Frankenstein", "Mary Shelley"),
		);
		expect(editionKey("Poems", "Percy Bysshe Shelley")).not.toBe(
			editionKey("Poems", "Mary Shelley"),
		);
	});

	it("keys a multi-author book by its first author", () => {
		expect(editionKey("The Three Musketeers", "Alexandre Dumas, Auguste Maquet")).toBe(
			editionKey("The Three Musketeers", "Alexandre Dumas"),
		);
	});
});

describe("collapseEditions", () => {
	it("keeps the first of each work", () => {
		const out = collapseEditions([
			r("gutenberg:84", "Frankenstein; Or, The Modern Prometheus", "Mary Wollstonecraft Shelley"),
			r(
				"gutenberg:41445",
				"Frankenstein; Or, The Modern Prometheus",
				"Mary Wollstonecraft Shelley",
			),
			r("gutenberg:18247", "The Last Man", "Mary Wollstonecraft Shelley"),
		]);
		expect(out.map((b) => b.id)).toEqual(["gutenberg:84", "gutenberg:18247"]);
	});
});
