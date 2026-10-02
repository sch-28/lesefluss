import { describe, expect, it } from "vitest";
import { cleanTitle, displayAuthor, MARC_SUBFIELD_SQL_PATTERN } from "../display.js";

describe("cleanTitle", () => {
	it("turns MARC subfield markers into a plain subtitle", () => {
		expect(cleanTitle("Ancient law : $b its connection with the early history of society")).toBe(
			"Ancient law: its connection with the early history of society",
		);
		expect(cleanTitle("The possessed $b or, The devils")).toBe("The possessed: or, The devils");
		expect(cleanTitle("A title : $b sub : $c by someone")).toBe("A title: sub: by someone");
	});

	it("leaves ordinary titles alone, dollar signs included", () => {
		expect(cleanTitle("Pride and Prejudice")).toBe("Pride and Prejudice");
		expect(cleanTitle("The $30,000 Bequest")).toBe("The $30,000 Bequest");
	});

	it("matches the SQL pattern used for stored rows", () => {
		expect(new RegExp(MARC_SUBFIELD_SQL_PATTERN).test("x : $b y")).toBe(true);
		expect(new RegExp(MARC_SUBFIELD_SQL_PATTERN).test("The $30,000 Bequest")).toBe(false);
	});
});

describe("displayAuthor", () => {
	it("shows Gutenberg names first-name first", () => {
		expect(displayAuthor("Shelley, Mary Wollstonecraft", "gutenberg")).toBe(
			"Mary Wollstonecraft Shelley",
		);
		expect(displayAuthor("Dumas, Alexandre, Maquet, Auguste", "gutenberg")).toBe(
			"Alexandre Dumas, Auguste Maquet",
		);
		expect(displayAuthor("Tolstoy, Leo, graf", "gutenberg")).toBe("Leo Tolstoy");
		expect(displayAuthor("Plato", "gutenberg")).toBe("Plato");
	});

	it("uses a parenthetical expansion as the given name", () => {
		expect(displayAuthor("Troward, T. (Thomas)", "gutenberg")).toBe("Thomas Troward");
		expect(displayAuthor("Wells, H. G. (Herbert George)", "gutenberg")).toBe(
			"Herbert George Wells",
		);
		expect(displayAuthor("Murdock, Charles A. (Charles Albert)", "gutenberg")).toBe(
			"Charles Albert Murdock",
		);
	});

	it("leaves Standard Ebooks names and missing authors as they are", () => {
		expect(displayAuthor("Joseph Conrad, Ford Madox Ford", "standard_ebooks")).toBe(
			"Joseph Conrad, Ford Madox Ford",
		);
		expect(displayAuthor(null, "gutenberg")).toBeNull();
	});
});
