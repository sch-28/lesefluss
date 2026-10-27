import { describe, expect, it } from "vitest";
import { hyphenationLang } from "./hyphenation-lang";

describe("hyphenationLang", () => {
	it("falls back to the device language when the book has no language", () => {
		expect(hyphenationLang(null, "de-DE")).toBe("de-DE");
		expect(hyphenationLang(undefined, "fr")).toBe("fr");
		expect(hyphenationLang("  ", "nl")).toBe("nl");
	});

	it("falls back to English when the device language is unusable too", () => {
		expect(hyphenationLang(null, "")).toBe("en");
		expect(hyphenationLang("not a tag", "und")).toBe("en");
	});

	it("keeps well-formed tags, canonicalised", () => {
		expect(hyphenationLang("de", "fr")).toBe("de");
		expect(hyphenationLang("EN-gb", "fr")).toBe("en-GB");
		expect(hyphenationLang("zh-hant-tw", "fr")).toBe("zh-Hant-TW");
	});

	it("accepts ISO 639-2 codes and underscore separators some EPUBs use", () => {
		expect(hyphenationLang("ger", "fr")).toBe("de");
		expect(hyphenationLang("fre", "de")).toBe("fr");
		expect(hyphenationLang("de_AT", "fr")).toBe("de-AT");
	});

	it("reads common language names", () => {
		expect(hyphenationLang("English", "de")).toBe("en");
		expect(hyphenationLang("Deutsch", "en")).toBe("de");
		expect(hyphenationLang(" german ", "en")).toBe("de");
	});

	it("falls back for free text and the ISO 'no particular language' codes", () => {
		for (const code of ["not a tag", "und", "mul", "mis", "zxx", "und-Latn"]) {
			expect(hyphenationLang(code, "sv")).toBe("sv");
		}
	});
});
