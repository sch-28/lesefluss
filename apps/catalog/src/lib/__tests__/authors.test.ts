import { describe, expect, it } from "vitest";
import { authorKey, authorKeys, splitAuthors } from "../authors.js";

describe("authorKey", () => {
	it("matches Gutenberg and SE spellings of the same author", () => {
		expect(authorKey("Shelley, Mary Wollstonecraft")).toBe("mary shelley");
		expect(authorKey("Mary Shelley")).toBe("mary shelley");
		expect(authorKey("Doyle, Arthur Conan")).toBe(authorKey("Arthur Conan Doyle"));
		expect(authorKey("Wells, H. G. (Herbert George)")).toBe(authorKey("H. G. Wells"));
		expect(authorKey("Goethe, Johann Wolfgang von")).toBe(authorKey("Johann Wolfgang von Goethe"));
	});

	it("strips diacritics", () => {
		expect(authorKey("Dostoyevsky, Fyodor")).toBe("fyodor dostoyevsky");
		expect(authorKey("Émile Zola")).toBe("emile zola");
	});

	it("handles mononyms and trailing honorifics", () => {
		expect(authorKey("Plato")).toBe("plato");
		expect(authorKey("Tolstoy, Leo, graf")).toBe("leo tolstoy");
	});

	it("returns null for empty input", () => {
		expect(authorKey("  ")).toBeNull();
	});
});

describe("splitAuthors", () => {
	it("pairs Gutenberg Last, First parts", () => {
		expect(splitAuthors("Dumas, Alexandre, Maquet, Auguste")).toEqual([
			"Dumas, Alexandre",
			"Maquet, Auguste",
		]);
	});

	it("keeps SE First Last names whole", () => {
		expect(splitAuthors("Joseph Conrad, Ford Madox Ford")).toEqual([
			"Joseph Conrad",
			"Ford Madox Ford",
		]);
	});

	it("skips honorific parts", () => {
		expect(splitAuthors("Tolstoy, Leo, graf")).toEqual(["Tolstoy, Leo"]);
	});
});

describe("authorKeys", () => {
	it("dedupes", () => {
		expect(authorKeys(["Mary Shelley", "Shelley, Mary"])).toEqual(["mary shelley"]);
	});
});
