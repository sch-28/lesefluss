import { describe, expect, it } from "vitest";
import { stripPunct } from "../rsvp-engine";

describe("stripPunct", () => {
	it("preserves non-ASCII letters", () => {
		// The ASCII-only version truncated these, which broke lookup for every
		// German noun and every accented English word.
		expect(stripPunct("Bäume")).toBe("Bäume");
		expect(stripPunct("café")).toBe("café");
		expect(stripPunct("naïve")).toBe("naïve");
		expect(stripPunct("Sprüche")).toBe("Sprüche");
		expect(stripPunct("straße")).toBe("straße");
	});

	it("preserves casing", () => {
		// Casing is the only thing separating some German homographs once the
		// server folds the lookup key: "Bäume" the trees, "bäume" the verb.
		expect(stripPunct("Bäume")).toBe("Bäume");
		expect(stripPunct("bäume")).toBe("bäume");
		expect(stripPunct("Paris")).toBe("Paris");
	});

	it("keeps a decomposed spelling intact for the server to compose", () => {
		const decomposed = "café".normalize("NFD");
		expect(stripPunct(decomposed).normalize("NFC")).toBe("café");
	});

	it("keeps hyphens and folds apostrophes to ASCII", () => {
		// Books mix ' and ’ freely. Glossary entries match on exact label, so
		// leaving both would file the same word twice.
		expect(stripPunct("don't")).toBe("don't");
		expect(stripPunct("don’t")).toBe("don't");
		expect(stripPunct("co-operate")).toBe("co-operate");
	});

	it("strips surrounding punctuation and quotes", () => {
		expect(stripPunct("«Gift».")).toBe("Gift");
		expect(stripPunct('"Hello,"')).toBe("Hello");
		expect(stripPunct("word—dash")).toBe("worddash");
	});

	it("still strips digits, so a tap on a number stays inert", () => {
		expect(stripPunct("1984")).toBe("");
		expect(stripPunct("—")).toBe("");
		expect(stripPunct("")).toBe("");
	});
});
