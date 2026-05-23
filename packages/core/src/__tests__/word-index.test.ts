import { describe, expect, it } from "vitest";
import { utf8ByteLength } from "../utf8";
import { WordIndex, wordPos } from "../word-index";

describe("WordIndex.build", () => {
	it("returns wordCount 0 for empty content", () => {
		const idx = WordIndex.build("");
		expect(idx.wordCount).toBe(0);
	});

	it("returns wordCount 0 for whitespace-only content", () => {
		const idx = WordIndex.build("   \n\t  ");
		expect(idx.wordCount).toBe(0);
	});

	it("handles a single word with no surrounding whitespace", () => {
		const idx = WordIndex.build("hello");
		expect(idx.wordCount).toBe(1);
		expect(idx.wordAt(wordPos(0))).toMatchObject({ word: "hello", byteOffset: 0 });
	});

	it("ignores trailing whitespace", () => {
		const idx = WordIndex.build("hello world   \n");
		expect(idx.wordCount).toBe(2);
		expect(idx.wordAt(wordPos(1)).word).toBe("world");
	});

	it("treats hyphenated words as a single token", () => {
		const idx = WordIndex.build("blue-dragonfly-shine flies");
		expect(idx.wordCount).toBe(2);
		expect(idx.wordAt(wordPos(0)).word).toBe("blue-dragonfly-shine");
	});

	it("splits on em-dash / en-dash, emitting a standalone hyphen token", () => {
		// Device approximates em/en dash to ' - ' (spaced), which the tokenizer
		// then emits as a standalone hyphen between the surrounding words.
		const idx = WordIndex.build("foo—bar baz–qux");
		expect(idx.wordCount).toBe(6);
		expect(idx.listEntries().map((e) => e.word)).toEqual(["foo", "-", "bar", "baz", "-", "qux"]);
	});

	it("drops soft hyphens (Unicode 0x00AD) from words", () => {
		// Soft hyphens are typographic hints, not part of the word; device drops
		// them, app mirrors.
		const idx = WordIndex.build("co­operate test");
		expect(idx.wordCount).toBe(2);
		expect(idx.wordAt(wordPos(0)).word).toBe("cooperate");
	});

	it("marks breakBefore on 2+ newlines", () => {
		const idx = WordIndex.build("para one.\n\npara two.");
		expect(idx.wordAt(wordPos(0)).breakBefore).toBeUndefined();
		expect(idx.wordAt(wordPos(2)).breakBefore).toBe(true);
	});

	it("does not mark breakBefore on a single newline", () => {
		const idx = WordIndex.build("line one\nline two");
		expect(idx.wordAt(wordPos(2)).breakBefore).toBeUndefined();
	});

	it("tracks UTF-8 byte offsets across multi-byte characters", () => {
		// Latin-1 letters (ä) are kept; emoji are dropped (device cannot display
		// them and we mirror that, keeping word-stream parity over BLE sync).
		const content = "ä 🦋 bee";
		const idx = WordIndex.build(content);
		expect(idx.wordCount).toBe(2);
		expect(idx.wordAt(wordPos(0))).toMatchObject({ word: "ä", byteOffset: 0 });
		expect(idx.wordAt(wordPos(1))).toMatchObject({
			word: "bee",
			byteOffset: utf8ByteLength("ä 🦋 "),
		});
	});
});

describe("WordIndex.byteOf / wordOf", () => {
	const content = "alpha beta gamma delta";
	const idx = WordIndex.build(content);

	it("byteOf returns the word's byte offset", () => {
		expect(idx.byteOf(wordPos(0))).toBe(0);
		expect(idx.byteOf(wordPos(1))).toBe(utf8ByteLength("alpha "));
		expect(idx.byteOf(wordPos(2))).toBe(utf8ByteLength("alpha beta "));
	});

	it("wordOf returns the word containing the given byte", () => {
		expect(idx.wordOf(0)).toBe(wordPos(0));
		expect(idx.wordOf(2)).toBe(wordPos(0));
		expect(idx.wordOf(utf8ByteLength("alpha "))).toBe(wordPos(1));
		expect(idx.wordOf(utf8ByteLength("alpha beta") - 1)).toBe(wordPos(1));
	});

	it("wordOf clamps negative byte to first word", () => {
		expect(idx.wordOf(-5)).toBe(wordPos(0));
	});

	it("wordOf clamps past-end byte to last word", () => {
		expect(idx.wordOf(10_000)).toBe(wordPos(3));
	});

	it("roundtrip: byteOf(wordOf(b)) ≤ b for every byte inside content", () => {
		const totalBytes = utf8ByteLength(content);
		for (let b = 0; b < totalBytes; b++) {
			const w = idx.wordOf(b);
			expect(idx.byteOf(w)).toBeLessThanOrEqual(b);
		}
	});

	it("roundtrip: wordOf(byteOf(w)) === w for every word", () => {
		for (let w = 0; w < idx.wordCount; w++) {
			expect(idx.wordOf(idx.byteOf(wordPos(w)))).toBe(wordPos(w));
		}
	});
});

describe("WordIndex.wordsBetween", () => {
	it("returns the absolute distance in words between two positions", () => {
		const idx = WordIndex.build("a b c d e f");
		expect(idx.wordsBetween(wordPos(1), wordPos(4))).toBe(3);
	});

	it("returns 0 when a equals b", () => {
		const idx = WordIndex.build("a b c");
		expect(idx.wordsBetween(wordPos(2), wordPos(2))).toBe(0);
	});

	it("handles reversed args as absolute difference", () => {
		const idx = WordIndex.build("a b c d");
		expect(idx.wordsBetween(wordPos(3), wordPos(1))).toBe(2);
	});
});

describe("WordIndex.wordAndCharOf", () => {
	const content = "hello world";
	const idx = WordIndex.build(content);

	it("returns word 0 char 0 at byte 0", () => {
		expect(idx.wordAndCharOf(0)).toEqual({ word: wordPos(0), charInWord: 0 });
	});

	it("returns char index inside a multi-char word", () => {
		expect(idx.wordAndCharOf(3)).toEqual({ word: wordPos(0), charInWord: 3 });
	});

	it("returns word 1 char 0 at the start of the second word", () => {
		const startOfWorld = utf8ByteLength("hello ");
		expect(idx.wordAndCharOf(startOfWorld)).toEqual({ word: wordPos(1), charInWord: 0 });
	});

	it("returns char index inside the second word", () => {
		const startOfWorld = utf8ByteLength("hello ");
		expect(idx.wordAndCharOf(startOfWorld + 2)).toEqual({
			word: wordPos(1),
			charInWord: 2,
		});
	});

	it("counts char index by UTF-8 code points, not bytes, inside multi-byte words", () => {
		const content2 = "café latte";
		const idx2 = WordIndex.build(content2);
		const eBytes = utf8ByteLength("café") - utf8ByteLength("é");
		expect(idx2.wordAndCharOf(eBytes)).toEqual({ word: wordPos(0), charInWord: 3 });
	});

	it("snaps a byte landing inside a multi-byte code point to that char's start", () => {
		const content2 = "café";
		const idx2 = WordIndex.build(content2);
		const midOfE = utf8ByteLength("café") - 1;
		expect(idx2.wordAndCharOf(midOfE)).toEqual({ word: wordPos(0), charInWord: 3 });
	});

	it("clamps a byte landing in whitespace to the next word with charInWord 0", () => {
		const inSpace = utf8ByteLength("hello");
		expect(idx.wordAndCharOf(inSpace)).toEqual({ word: wordPos(1), charInWord: 0 });
	});
});

describe("WordIndex serialize / deserialize", () => {
	const content = "alpha beta.\n\ngamma delta epsilon";
	const built = WordIndex.build(content);

	it("roundtrips through serialize/deserialize", () => {
		const roundtripped = WordIndex.deserialize(built.serialize(), content);
		expect(roundtripped.wordCount).toBe(built.wordCount);
		for (let w = 0; w < built.wordCount; w++) {
			expect(roundtripped.wordAt(wordPos(w))).toEqual(built.wordAt(wordPos(w)));
		}
	});

	it("preserves byte ↔ word query results after a roundtrip", () => {
		const roundtripped = WordIndex.deserialize(built.serialize(), content);
		const totalBytes = utf8ByteLength(content);
		for (let b = 0; b < totalBytes; b += 3) {
			expect(roundtripped.wordOf(b)).toBe(built.wordOf(b));
		}
	});

	it("preserves breakBefore through a roundtrip", () => {
		const roundtripped = WordIndex.deserialize(built.serialize(), content);
		expect(roundtripped.wordAt(wordPos(2)).breakBefore).toBe(true);
	});
});

describe("WordPosition brand", () => {
	it("rejects raw numbers at the type level (compile-time check via wordPos factory)", () => {
		const idx = WordIndex.build("a b c");
		const pos = wordPos(1);
		expect(idx.wordAt(pos).word).toBe("b");
	});
});
