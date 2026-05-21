import { describe, expect, it } from "vitest";
import { buildWordIndex } from "../engine";
import { approximate } from "../tokenizer";

/**
 * Targeted tests for the device-aligned tokenizer.
 *
 * Goal: lock in the rules so future drift between the firmware tokenizer
 * (apps/rsvpnano/src/storage/StorageManager.cpp::appendTokenizedLineWords) and
 * this TS port shows up here first.
 *
 * Each rule cites the firmware source location it mirrors.
 */

const words = (content: string) => buildWordIndex(content).map((e) => e.word);

describe("approximate (codepoint → normalized replacement)", () => {
	it("passes ASCII printable through unchanged", () => {
		for (let cp = 0x20; cp <= 0x7e; cp++) {
			expect(approximate(cp)).toBe(String.fromCharCode(cp));
		}
	});

	it("drops soft hyphen and zero-width characters", () => {
		expect(approximate(0x00ad)).toBe(""); // soft hyphen
		expect(approximate(0x200b)).toBe(""); // ZWSP
		expect(approximate(0x200d)).toBe(""); // ZWJ
		expect(approximate(0xfeff)).toBe(""); // BOM
	});

	it("folds Unicode spaces to a single ASCII space", () => {
		expect(approximate(0x00a0)).toBe(" "); // NBSP
		expect(approximate(0x2028)).toBe(" "); // LINE SEPARATOR
		expect(approximate(0x2029)).toBe(" "); // PARAGRAPH SEPARATOR
		expect(approximate(0x3000)).toBe(" "); // IDEOGRAPHIC SPACE
		expect(approximate(0x2003)).toBe(" "); // EM SPACE
	});

	it("expands em/en dashes to ` - ` (spaced) so tokenizer emits standalone hyphen", () => {
		expect(approximate(0x2013)).toBe(" - "); // en-dash
		expect(approximate(0x2014)).toBe(" - "); // em-dash
	});

	it("keeps non-spaced hyphen variants as inline -", () => {
		expect(approximate(0x2010)).toBe("-"); // hyphen
		expect(approximate(0x2011)).toBe("-"); // non-breaking hyphen
		expect(approximate(0x2212)).toBe("-"); // minus sign
	});

	it("folds typographic ellipsis (U+2026) to three ASCII dots", () => {
		expect(approximate(0x2026)).toBe("...");
	});

	it("folds smart quotes to ASCII quotes", () => {
		expect(approximate(0x2018)).toBe("'");
		expect(approximate(0x2019)).toBe("'");
		expect(approximate(0x201c)).toBe('"');
		expect(approximate(0x201d)).toBe('"');
	});

	it("keeps Latin-1 supplement letters verbatim", () => {
		expect(approximate(0x00e9)).toBe("é"); // é
		expect(approximate(0x00fc)).toBe("ü"); // ü
		expect(approximate(0x00c4)).toBe("Ä"); // Ä
	});

	it("folds ligatures to component letters", () => {
		expect(approximate(0xfb01)).toBe("fi");
		expect(approximate(0xfb02)).toBe("fl");
		expect(approximate(0xfb00)).toBe("ff");
	});

	it("folds Latin Extended-A letters to ASCII", () => {
		expect(approximate(0x0160)).toBe("S"); // Š
		expect(approximate(0x0161)).toBe("s"); // š
		expect(approximate(0x010d)).toBe("c"); // č
	});

	it("drops unmappable codepoints (CJK, emoji, Greek, Cyrillic)", () => {
		expect(approximate(0x4e2d)).toBe(""); // 中
		expect(approximate(0x1f98b)).toBe(""); // 🦋
		expect(approximate(0x03b1)).toBe(""); // α
		expect(approximate(0x0410)).toBe(""); // А (Cyrillic)
	});
});

describe("tokenizer rules (mirrors StorageManager.cpp::appendTokenizedLineWords)", () => {
	it("splits on ASCII whitespace", () => {
		expect(words("hello world foo")).toEqual(["hello", "world", "foo"]);
	});

	it("keeps inline hyphens between word chars in a single token", () => {
		expect(words("blue-dragonfly-shine flies")).toEqual(["blue-dragonfly-shine", "flies"]);
	});

	it("emits standalone hyphen when not flanked by word chars", () => {
		expect(words("foo - bar")).toEqual(["foo", "-", "bar"]);
	});

	it("collapses runs of dashes to a single standalone hyphen", () => {
		expect(words("foo--bar")).toEqual(["foo", "-", "bar"]);
		expect(words("foo --- bar")).toEqual(["foo", "-", "bar"]);
	});

	it("merges ellipsis into the previous word", () => {
		expect(words("wait... what")).toEqual(["wait...", "what"]);
	});

	it("folds Unicode ellipsis (U+2026) the same way", () => {
		expect(words("wait… what")).toEqual(["wait...", "what"]);
	});

	it("drops standalone ellipsis with no preceding word", () => {
		expect(words("... start")).toEqual(["start"]);
	});

	it("filters punctuation-only tokens (no readable char)", () => {
		// "!?" has no letter or digit and no hyphen, so the device drops it.
		expect(words("hello !? world")).toEqual(["hello", "world"]);
	});

	it("keeps tokens that contain at least one word char (attached punctuation)", () => {
		expect(words("Hello, world!")).toEqual(["Hello,", "world!"]);
	});

	it("strips the leading UTF-8 BOM at start of content", () => {
		expect(words("﻿Hello world")).toEqual(["Hello", "world"]);
	});

	it("folds smart quotes inside words", () => {
		expect(words("don’t panic")).toEqual(["don't", "panic"]);
	});

	it("treats NBSP as whitespace boundary", () => {
		expect(words("foo bar")).toEqual(["foo", "bar"]);
	});

	it("marks breakBefore on words after a 2+ newline run", () => {
		const entries = buildWordIndex("para one.\n\npara two.");
		const para2 = entries.find((e) => e.word === "para" && e.breakBefore);
		expect(para2).toBeDefined();
	});

	it("does not mark breakBefore on a single newline", () => {
		const entries = buildWordIndex("line one\nline two");
		expect(entries.every((e) => e.breakBefore !== true)).toBe(true);
	});

	it("emits 'fi' (two chars) from a single fi ligature codepoint", () => {
		expect(words("ofﬁce hours")).toEqual(["office", "hours"]);
	});
});

describe("tokenizer byte offsets", () => {
	it("records the source UTF-8 byte offset of the first char of each word", () => {
		// "Hä Z": H=byte0, ä=bytes 1-2 (2 bytes UTF-8), space byte 3, Z byte 4.
		const entries = buildWordIndex("Hä Z");
		expect(entries).toEqual([
			{ word: "Hä", byteOffset: 0 },
			{ word: "Z", byteOffset: 4 },
		]);
	});

	it("records source byte offset across dropped codepoints", () => {
		// "a🦋b": a=byte0, 🦋=bytes 1-4 (4 bytes UTF-8, dropped), b=byte5.
		// Tokenizer fuses dropped chars: "a" and "b" land back-to-back in the
		// normalized stream, producing ONE token "ab" anchored at byte 0.
		const entries = buildWordIndex("a🦋b");
		expect(entries).toEqual([{ word: "ab", byteOffset: 0 }]);
	});

	it("captures the dash byte offset for standalone hyphen tokens", () => {
		// foo at byte 0, em-dash (3 UTF-8 bytes) at byte 3, bar at byte 6.
		const entries = buildWordIndex("foo—bar");
		expect(entries.map((e) => ({ word: e.word, byteOffset: e.byteOffset }))).toEqual([
			{ word: "foo", byteOffset: 0 },
			{ word: "-", byteOffset: 3 },
			{ word: "bar", byteOffset: 6 },
		]);
	});
});
