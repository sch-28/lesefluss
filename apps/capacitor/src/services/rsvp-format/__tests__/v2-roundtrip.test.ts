/**
 * Integration tests for the .rsvp v2 builder ↔ parser round-trip.
 *
 * Mirrors the test vectors in docs/rsvp-protocol.md. Run before flashing
 * any firmware change that touches StorageManager.cpp::processIndexedRsvpV2Line
 * or builder.ts::buildV2.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { WordIndex } from "@lesefluss/core";
import { describe, expect, it } from "vitest";
import { buildRsvpDocument } from "../builder";
import { parseRsvpV2 } from "../parser";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

const decode = (b: Uint8Array) => new TextDecoder().decode(b);

function build(opts: {
	content: string;
	title?: string;
	author?: string;
	source?: string;
	chapters?: { title: string; startByte: number }[];
}) {
	const idx = WordIndex.build(opts.content);
	const bytes = buildRsvpDocument({
		title: opts.title ?? "T",
		author: opts.author,
		source: opts.source,
		body: opts.content,
		chapters: opts.chapters,
		wordIndex: idx,
		version: 2,
	});
	return { idx, bytes };
}

describe("v2 round-trip: builder → parser", () => {
	describe("Vector 1: empty book", () => {
		it("emits a valid empty file the parser accepts", () => {
			const { idx, bytes } = build({ title: "Empty", content: "" });
			const parsed = parseRsvpV2(bytes);

			expect(parsed.version).toBe(2);
			expect(parsed.title).toBe("Empty");
			expect(parsed.words.length).toBe(idx.wordCount);
			expect(parsed.words.length).toBe(0);
			expect(parsed.paragraphStarts.length).toBeGreaterThanOrEqual(0);
			expect(parsed.chapters.length).toBe(0);
			expect(parsed.stats.strayLines).toBe(0);
			expect(parsed.stats.finalState).toBe("DONE");
			expect(parsed.stats.v2Remaining).toBe(0);
		});
	});

	describe("Vector 2: single-paragraph plain ASCII", () => {
		it("emits three words and one paragraph", () => {
			const content = "alpha beta gamma";
			const { idx, bytes } = build({ content });
			const parsed = parseRsvpV2(bytes);

			expect(parsed.words).toEqual(["alpha", "beta", "gamma"]);
			expect(parsed.words.length).toBe(idx.wordCount);
			expect(parsed.paragraphStarts).toEqual([0]);
			expect(parsed.chapters).toEqual([]);
			expect(parsed.stats.strayLines).toBe(0);
			expect(parsed.stats.finalState).toBe("DONE");
		});
	});

	describe("Vector 3: ellipsis across newline (materializeEntry bug)", () => {
		it("merges ellipsis without injecting \\n into the word", () => {
			const content = "foo\n\n...\n\nbar";
			const { idx, bytes } = build({ content });
			const parsed = parseRsvpV2(bytes);

			expect(parsed.words.length).toBe(idx.wordCount);
			// INV-B2: words MUST NOT contain \n / \r / \t.
			for (const w of parsed.words) {
				expect(w).not.toMatch(/[\n\r\t]/);
			}
			expect(parsed.stats.strayLines).toBe(0);
			expect(parsed.stats.finalState).toBe("DONE");
			// Tokenizer-specific check: ellipsis-merged token starts with "foo".
			expect(parsed.words[0].startsWith("foo")).toBe(true);
		});
	});

	describe("Vector 4: words starting with @", () => {
		it("treats @-prefixed words as words, not directives", () => {
			const content = "ping @user reply @bot";
			const { idx, bytes } = build({ content });
			const parsed = parseRsvpV2(bytes);

			expect(parsed.words.length).toBe(idx.wordCount);
			expect(parsed.words).toContain("@user");
			expect(parsed.words).toContain("@bot");
			expect(parsed.stats.strayLines).toBe(0);
			expect(parsed.stats.finalState).toBe("DONE");
		});
	});

	describe("Vector 5a: multiple paragraphs + chapter markers", () => {
		it("emits chapter markers at the right word indices", () => {
			const content = "Chapter One\n\nThe first paragraph.\n\nMore body.\n\nChapter Two\n\nSecond chapter starts here.";
			const chapters = [
				{ title: "Chapter One", startByte: 0 },
				{
					title: "Chapter Two",
					startByte: new TextEncoder().encode(
						"Chapter One\n\nThe first paragraph.\n\nMore body.\n\n",
					).length,
				},
			];
			const { idx, bytes } = build({ content, chapters });
			const parsed = parseRsvpV2(bytes);

			expect(parsed.words.length).toBe(idx.wordCount);
			expect(parsed.chapters.length).toBe(2);
			expect(parsed.chapters[0].title).toBe("Chapter One");
			expect(parsed.chapters[1].title).toBe("Chapter Two");
			expect(parsed.chapters[0].wordIndex).toBeLessThan(parsed.chapters[1].wordIndex);
			expect(parsed.stats.strayLines).toBe(0);
			expect(parsed.stats.finalState).toBe("DONE");
		});
	});

	describe("Cross-cutting invariants (INV-B*, INV-P*)", () => {
		const fixtures: Array<{ name: string; content: string }> = [
			{ name: "tiny", content: "hello world" },
			{
				name: "smart quotes + em-dash",
				content: 'She said, “don’t go there—please”.',
			},
			{ name: "many short words", content: Array(500).fill("the").join(" ") },
			{
				name: "ellipsis edge cases",
				content: "wait... what? oh… nevermind. one\n\n...\n\ntwo",
			},
			{
				name: "long paragraph + line breaks",
				content: Array.from({ length: 200 }, (_, i) => `sentence number ${i}.`).join(" "),
			},
		];

		for (const fx of fixtures) {
			it(`INV-B1/INV-P3: word count round-trips (${fx.name})`, () => {
				const { idx, bytes } = build({ content: fx.content });
				const parsed = parseRsvpV2(bytes);
				expect(parsed.words.length).toBe(idx.wordCount);
				expect(parsed.stats.finalState).toBe("DONE");
				expect(parsed.stats.strayLines).toBe(0);
			});

			it(`INV-B2: every word is free of whitespace (${fx.name})`, () => {
				const { bytes } = build({ content: fx.content });
				const parsed = parseRsvpV2(bytes);
				for (const w of parsed.words) {
					expect(w).not.toMatch(/[\n\r\t]/);
				}
			});

			it(`INV-B6: final byte is LF (${fx.name})`, () => {
				const { bytes } = build({ content: fx.content });
				expect(bytes[bytes.length - 1]).toBe(0x0a);
			});

			it(`INV-B7: builder is deterministic (${fx.name})`, () => {
				const { bytes: a } = build({ content: fx.content });
				const { bytes: b } = build({ content: fx.content });
				expect(decode(a)).toBe(decode(b));
			});
		}
	});

	describe("Vector 5b: full Frankenstein round-trip", () => {
		const frankensteinPath = join(FIXTURE_DIR, "frankenstein.txt");
		const content = readFileSync(frankensteinPath, "utf-8");

		it("declared @words count matches actual word-line count", () => {
			const { idx, bytes } = build({ title: "Frankenstein", author: "Mary Shelley", content });
			const text = decode(bytes);
			const lines = text.split("\n");
			const wIdx = lines.findIndex((l) => l.startsWith("@words "));
			const pIdx = lines.findIndex((l) => l.startsWith("@paragraphs "));
			const declared = Number.parseInt(lines[wIdx].slice("@words ".length), 10);
			expect(declared).toBe(idx.wordCount);
			expect(pIdx - wIdx - 1).toBe(declared);
		});

		it("parser reconstructs the exact canonical word stream", () => {
			const { idx, bytes } = build({ title: "Frankenstein", author: "Mary Shelley", content });
			const parsed = parseRsvpV2(bytes);

			expect(parsed.title).toBe("Frankenstein");
			expect(parsed.author).toBe("Mary Shelley");
			expect(parsed.words.length).toBe(idx.wordCount);
			expect(parsed.stats.strayLines).toBe(0);
			expect(parsed.stats.finalState).toBe("DONE");
			expect(parsed.stats.v2Remaining).toBe(0);

			// Verify every word matches the canonical tokenizer output byte-for-byte.
			// Compare in chunks to keep the error message manageable if it ever fires.
			const entries = idx.listEntries();
			let firstMismatchIndex = -1;
			for (let i = 0; i < entries.length; i++) {
				if (entries[i].word !== parsed.words[i]) {
					firstMismatchIndex = i;
					break;
				}
			}
			if (firstMismatchIndex >= 0) {
				const a = entries[firstMismatchIndex].word;
				const b = parsed.words[firstMismatchIndex];
				throw new Error(
					`word mismatch at index ${firstMismatchIndex}: tokenizer=${JSON.stringify(a)} parsed=${JSON.stringify(b)}`,
				);
			}
		});

		it("INV-B2: no word in the emitted file contains \\n, \\r, or \\t", () => {
			const { bytes } = build({ content });
			const parsed = parseRsvpV2(bytes);
			for (let i = 0; i < parsed.words.length; i++) {
				if (/[\n\r\t]/.test(parsed.words[i])) {
					throw new Error(
						`word ${i} contains whitespace: ${JSON.stringify(parsed.words[i])}`,
					);
				}
			}
		});

		it("paragraph + chapter markers stay within bounds", () => {
			const { idx, bytes } = build({ content });
			const parsed = parseRsvpV2(bytes);
			for (const p of parsed.paragraphStarts) {
				expect(p).toBeGreaterThanOrEqual(0);
				expect(p).toBeLessThanOrEqual(idx.wordCount);
			}
			for (const c of parsed.chapters) {
				expect(c.wordIndex).toBeGreaterThanOrEqual(0);
				expect(c.wordIndex).toBeLessThanOrEqual(idx.wordCount);
				expect(c.title.length).toBeGreaterThan(0);
			}
		});
	});

	describe("INV-T3: byte-length sanity", () => {
		it("declared @words count matches actual word-line count in file bytes", () => {
			const content = "alpha beta\n\ngamma\ndelta epsilon...zeta";
			const { idx, bytes } = build({ content });
			const text = decode(bytes);
			const lines = text.split("\n");
			const wIdx = lines.findIndex((l) => l.startsWith("@words "));
			const pIdx = lines.findIndex((l) => l.startsWith("@paragraphs "));
			expect(wIdx).toBeGreaterThan(0);
			expect(pIdx).toBeGreaterThan(wIdx);
			const declared = Number.parseInt(lines[wIdx].slice("@words ".length), 10);
			expect(declared).toBe(idx.wordCount);
			expect(pIdx - wIdx - 1).toBe(declared);
		});
	});
});
