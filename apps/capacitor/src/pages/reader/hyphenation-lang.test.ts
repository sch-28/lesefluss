import { describe, expect, it } from "vitest";
import { hyphenationLang } from "./hyphenation-lang";

describe("hyphenationLang", () => {
	it("falls back to English when the book has no language", () => {
		expect(hyphenationLang(null)).toBe("en");
		expect(hyphenationLang(undefined)).toBe("en");
		expect(hyphenationLang("  ")).toBe("en");
	});

	it("keeps well-formed tags, canonicalised", () => {
		expect(hyphenationLang("de")).toBe("de");
		expect(hyphenationLang("EN-gb")).toBe("en-GB");
		expect(hyphenationLang("zh-hant-tw")).toBe("zh-Hant-TW");
	});

	it("accepts ISO 639-2 codes and underscore separators some EPUBs use", () => {
		expect(hyphenationLang("ger")).toBe("de");
		expect(hyphenationLang("fre")).toBe("fr");
		expect(hyphenationLang("de_AT")).toBe("de-AT");
	});

	it("falls back for free text that is not a language tag", () => {
		expect(hyphenationLang("English")).toBe("en");
		expect(hyphenationLang("not a tag")).toBe("en");
	});

	it("falls back for the ISO 'no particular language' codes", () => {
		for (const code of ["und", "mul", "mis", "zxx", "und-Latn"]) {
			expect(hyphenationLang(code)).toBe("en");
		}
	});
});
