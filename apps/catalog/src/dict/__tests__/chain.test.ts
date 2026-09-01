import { describe, expect, it } from "vitest";
import { buildChain, normalizeLang } from "../chain.js";

describe("normalizeLang", () => {
	it("accepts plain codes", () => {
		expect(normalizeLang("en")).toBe("en");
		expect(normalizeLang("de")).toBe("de");
	});

	it("reduces region-qualified tags to the primary subtag", () => {
		// Standard Ebooks reports en-GB; Gutendex reports en.
		expect(normalizeLang("en-GB")).toBe("en");
		expect(normalizeLang("de-AT")).toBe("de");
		expect(normalizeLang("de_CH")).toBe("de");
	});

	it("is case-insensitive and trims", () => {
		expect(normalizeLang("  EN  ")).toBe("en");
		expect(normalizeLang("De-at")).toBe("de");
	});

	it("accepts language names, since the field is free text in the app", () => {
		expect(normalizeLang("English")).toBe("en");
		expect(normalizeLang("Deutsch")).toBe("de");
		expect(normalizeLang("german")).toBe("de");
	});

	it("returns null for anything it cannot place", () => {
		// Never an error: an unusable value costs the book-language-first hop,
		// nothing more.
		for (const value of ["", "   ", "!!!", "xx", "klingon", null, undefined]) {
			expect(normalizeLang(value), String(value)).toBeNull();
		}
	});

	it("returns null for a language with no dictionary loaded", () => {
		// "fr" is a real tag but has no edition configured yet; letting it through
		// would put a language with no rows at the head of the chain.
		expect(normalizeLang("fr")).toBeNull();
	});
});

describe("buildChain", () => {
	it("puts the requested language first", () => {
		expect(buildChain("de")[0]).toBe("de");
		expect(buildChain("en")[0]).toBe("en");
	});

	it("keeps the configured fallback order behind it", () => {
		expect(buildChain("de")).toEqual(["de", "en"]);
	});

	it("falls back to the configured order when nothing was requested", () => {
		expect(buildChain(null)).toEqual(["en", "de"]);
	});

	it("never repeats a language", () => {
		const chain = buildChain("en");
		expect(new Set(chain).size).toBe(chain.length);
	});
});
