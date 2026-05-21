import { utf8ByteLength } from "@lesefluss/core";
import { describe, expect, it } from "vitest";
import type { Chapter } from "../schema";
import { computeBookConversion, serializeWordIndex } from "../word-index-backfill";

const SIMPLE = "alpha beta gamma delta epsilon";

describe("computeBookConversion", () => {
	it("converts position to wordPosition via WordIndex.wordOf", () => {
		const out = computeBookConversion({
			position: utf8ByteLength("alpha beta "),
			content: SIMPLE,
			chapters: null,
			highlights: [],
			sessions: [],
		});
		expect(out.wordPosition).toBe(2);
	});

	it("returns wordPosition 0 for empty content + position 0", () => {
		const out = computeBookConversion({
			position: 0,
			content: "",
			chapters: null,
			highlights: [],
			sessions: [],
		});
		expect(out.wordPosition).toBe(0);
		expect(out.wordIndex.wordCount).toBe(0);
	});

	it("converts highlight byte offsets to Option A anchors", () => {
		const startOfBeta = utf8ByteLength("alpha ");
		const middleOfGamma = utf8ByteLength("alpha beta gam");
		const out = computeBookConversion({
			position: 0,
			content: SIMPLE,
			chapters: null,
			highlights: [{ id: "h1", startOffset: startOfBeta, endOffset: middleOfGamma }],
			sessions: [],
		});
		expect(out.highlights).toEqual([
			{ id: "h1", startWord: 1, startCharInWord: 0, endWord: 2, endCharInWord: 3 },
		]);
	});

	it("converts session byte offsets to word bounds", () => {
		const out = computeBookConversion({
			position: 0,
			content: SIMPLE,
			chapters: null,
			highlights: [],
			sessions: [
				{
					id: "s1",
					startPos: utf8ByteLength("alpha "),
					endPos: utf8ByteLength("alpha beta gamma "),
				},
			],
		});
		expect(out.sessions).toEqual([{ id: "s1", startWord: 1, endWord: 3 }]);
	});

	it("adds startWord to each chapter without dropping startByte", () => {
		const chapters: Chapter[] = [
			{ title: "One", startByte: 0 },
			{ title: "Two", startByte: utf8ByteLength("alpha beta ") },
		];
		const out = computeBookConversion({
			position: 0,
			content: SIMPLE,
			chapters,
			highlights: [],
			sessions: [],
		});
		expect(out.chapters).toEqual([
			{ title: "One", startByte: 0, startWord: 0 },
			{ title: "Two", startByte: utf8ByteLength("alpha beta "), startWord: 2 },
		]);
	});

	it("returns null chapters when input chapters is null", () => {
		const out = computeBookConversion({
			position: 0,
			content: SIMPLE,
			chapters: null,
			highlights: [],
			sessions: [],
		});
		expect(out.chapters).toBeNull();
	});

	it("handles empty highlight/session arrays without error", () => {
		const out = computeBookConversion({
			position: 5,
			content: SIMPLE,
			chapters: null,
			highlights: [],
			sessions: [],
		});
		expect(out.highlights).toEqual([]);
		expect(out.sessions).toEqual([]);
	});

	it("handles multi-byte UTF-8 content for all conversions", () => {
		// Tokenizer drops emoji (device cannot display them), so the word stream
		// for "café 🦋 latte" is ["café", "latte"]: 2 words, not 3.
		const content = "café 🦋 latte";
		const startOfButterfly = utf8ByteLength("café ");
		const startOfLatte = utf8ByteLength("café 🦋 ");
		const out = computeBookConversion({
			position: startOfButterfly,
			content,
			chapters: [{ title: "intro", startByte: startOfLatte }],
			highlights: [{ id: "h1", startOffset: 0, endOffset: utf8ByteLength("café") - 1 }],
			sessions: [{ id: "s1", startPos: startOfButterfly, endPos: startOfLatte }],
		});
		// position byte lands inside the dropped emoji region → snaps back to "café".
		expect(out.wordPosition).toBe(0);
		expect(out.chapters?.[0].startWord).toBe(1);
		expect(out.highlights[0]).toEqual({
			id: "h1",
			startWord: 0,
			startCharInWord: 0,
			endWord: 0,
			endCharInWord: 3,
		});
		expect(out.sessions[0]).toEqual({ id: "s1", startWord: 0, endWord: 1 });
	});

	it("word-snaps a highlight whose start byte lands in whitespace", () => {
		const inSpace = utf8ByteLength("alpha");
		const out = computeBookConversion({
			position: 0,
			content: SIMPLE,
			chapters: null,
			highlights: [{ id: "h", startOffset: inSpace, endOffset: utf8ByteLength("alpha beta") - 1 }],
			sessions: [],
		});
		expect(out.highlights[0].startWord).toBe(1);
		expect(out.highlights[0].startCharInWord).toBe(0);
	});
});

describe("serializeWordIndex", () => {
	it("produces a JSON string parseable back to the WordIndex serialized shape", () => {
		const out = computeBookConversion({
			position: 0,
			content: SIMPLE,
			chapters: null,
			highlights: [],
			sessions: [],
		});
		const json = serializeWordIndex(out.wordIndex);
		expect(typeof json).toBe("string");
		const parsed = JSON.parse(json);
		expect(parsed.v).toBe(2);
		expect(parsed.byteOffsets.length).toBe(out.wordIndex.wordCount);
	});
});
