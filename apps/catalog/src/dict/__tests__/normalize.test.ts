import { describe, expect, it } from "vitest";
import { normalizeWord } from "../normalize.js";

describe("normalizeWord", () => {
	it("preserves non-ASCII letters", () => {
		expect(normalizeWord("Bäume")).toBe("bäume");
		expect(normalizeWord("café")).toBe("café");
		expect(normalizeWord("Sprüche")).toBe("sprüche");
		expect(normalizeWord("straße")).toBe("straße");
	});

	it("gives composed and decomposed spellings the same key", () => {
		const composed = "café".normalize("NFC");
		const decomposed = "café".normalize("NFD");
		expect(composed).not.toBe(decomposed);
		expect(normalizeWord(decomposed)).toBe(normalizeWord(composed));
	});

	it("folds typographic apostrophes so they match Wiktionary headwords", () => {
		expect(normalizeWord("don’t")).toBe("don't");
		expect(normalizeWord("don't")).toBe("don't");
	});

	it("keeps apostrophes and hyphens, drops everything else", () => {
		expect(normalizeWord("co-operate")).toBe("co-operate");
		expect(normalizeWord("«Gift».")).toBe("gift");
		expect(normalizeWord("1984")).toBe("");
		expect(normalizeWord("—")).toBe("");
		expect(normalizeWord("")).toBe("");
	});

	it("caps absurd input", () => {
		expect(normalizeWord("a".repeat(500))).toHaveLength(128);
	});
});
