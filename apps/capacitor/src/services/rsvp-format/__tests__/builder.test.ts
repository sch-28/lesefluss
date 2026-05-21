import { describe, expect, it } from "vitest";
import { buildRsvpDocument } from "../builder";

const decode = (bytes: Uint8Array) => new TextDecoder("utf-8").decode(bytes);

describe("buildRsvpDocument", () => {
	it("emits the version + title header for a minimal book", () => {
		const out = decode(buildRsvpDocument({ title: "Hello", body: "world" }));
		expect(out.startsWith("@rsvp 1\n@title Hello\n")).toBe(true);
	});

	it("omits author and source when not provided", () => {
		const out = decode(buildRsvpDocument({ title: "T", body: "b" }));
		expect(out).not.toMatch(/@author/);
		expect(out).not.toMatch(/@source/);
	});

	it("emits author and source when provided", () => {
		const out = decode(
			buildRsvpDocument({
				title: "T",
				author: "A",
				source: "src.epub",
				body: "b",
			}),
		);
		expect(out).toMatch(/^@rsvp 1\n@title T\n@author A\n@source src\.epub\n/);
	});

	it("synthesizes a single @chapter when no chapters are provided", () => {
		const out = decode(buildRsvpDocument({ title: "Book", body: "lorem ipsum" }));
		expect(out).toMatch(/\n@chapter Book\nlorem ipsum\n$/);
	});

	it("emits one @chapter per provided chapter, slicing body by startByte", () => {
		const body = "AAAA\nBBBB\nCCCC";
		const out = decode(
			buildRsvpDocument({
				title: "T",
				body,
				chapters: [
					{ title: "One", startByte: 0 },
					{ title: "Two", startByte: 5 },
					{ title: "Three", startByte: 10 },
				],
			}),
		);
		// Body slices: [0..5)=AAAA\n, [5..10)=BBBB\n, [10..end)=CCCC
		expect(out).toContain("\n@chapter One\nAAAA\n");
		expect(out).toContain("\n@chapter Two\nBBBB\n");
		expect(out).toContain("\n@chapter Three\nCCCC\n");
	});

	it("escapes body lines that start with @ to @@", () => {
		const out = decode(buildRsvpDocument({ title: "T", body: "first\n@danger\nlast" }));
		expect(out).toContain("first\n@@danger\nlast");
	});

	it("escapes @ at the very start of the body", () => {
		const out = decode(buildRsvpDocument({ title: "T", body: "@only" }));
		expect(out).toContain("\n@@only\n");
	});

	it("trims directive payloads (no embedded newlines)", () => {
		const out = decode(
			buildRsvpDocument({ title: "Multi\nline title", author: "A\tuthor", body: "b" }),
		);
		expect(out).toMatch(/@title Multi line title\n/);
		expect(out).toMatch(/@author A uthor\n/);
	});

	it("sorts chapters by startByte before emitting", () => {
		const body = "AAAABBBBCCCC";
		const out = decode(
			buildRsvpDocument({
				title: "T",
				body,
				chapters: [
					{ title: "Two", startByte: 4 },
					{ title: "One", startByte: 0 },
					{ title: "Three", startByte: 8 },
				],
			}),
		);
		const oneIdx = out.indexOf("@chapter One");
		const twoIdx = out.indexOf("@chapter Two");
		const threeIdx = out.indexOf("@chapter Three");
		expect(oneIdx).toBeGreaterThan(0);
		expect(twoIdx).toBeGreaterThan(oneIdx);
		expect(threeIdx).toBeGreaterThan(twoIdx);
	});

	it("falls back to 'Chapter N' for chapters with empty titles", () => {
		const out = decode(
			buildRsvpDocument({
				title: "T",
				body: "AB",
				chapters: [
					{ title: "", startByte: 0 },
					{ title: "", startByte: 1 },
				],
			}),
		);
		expect(out).toMatch(/@chapter Chapter 1\n/);
		expect(out).toMatch(/@chapter Chapter 2\n/);
	});

	it("returns UTF-8 bytes", () => {
		const bytes = buildRsvpDocument({ title: "naïve", body: "café" });
		const decoded = new TextDecoder("utf-8").decode(bytes);
		expect(decoded).toContain("naïve");
		expect(decoded).toContain("café");
	});
});

describe("buildRsvpDocument v2", () => {
	it("emits exactly entries.length word lines + matching @words directive", async () => {
		const { WordIndex } = await import("@lesefluss/core");
		// Frankenstein-style text fragment with mixed punctuation + smart quotes.
		const content =
			"It was on a dreary night of November that I beheld the accomplishment of my toils.\n\n" +
			"With an anxiety that almost amounted to agony, I collected the instruments of life around me...\n\n" +
			"How can I describe my emotions at this catastrophe, or how delineate the wretch whom—" +
			"with such infinite pains and care I had endeavoured to form?";
		const idx = WordIndex.build(content);
		const bytes = buildRsvpDocument({
			title: "T",
			body: content,
			wordIndex: idx,
			version: 2,
		});
		const text = decode(bytes);
		const lines = text.split("\n");
		const wordsIdx = lines.findIndex((l) => l.startsWith("@words "));
		expect(wordsIdx).toBeGreaterThan(0);
		const declared = Number.parseInt(lines[wordsIdx].slice("@words ".length), 10);
		const parasIdx = lines.findIndex((l) => l.startsWith("@paragraphs "));
		expect(parasIdx).toBeGreaterThan(wordsIdx);
		const actualWordLines = parasIdx - wordsIdx - 1;
		expect(declared).toBe(idx.listEntries().length);
		expect(actualWordLines).toBe(declared);
	});

	it("does not emit \\n inside any word line", async () => {
		const { WordIndex } = await import("@lesefluss/core");
		const content = "alpha beta\n\ngamma\ndelta epsilon";
		const idx = WordIndex.build(content);
		const bytes = buildRsvpDocument({ title: "T", body: content, wordIndex: idx, version: 2 });
		const text = decode(bytes);
		const lines = text.split("\n");
		const wordsIdx = lines.findIndex((l) => l.startsWith("@words "));
		const parasIdx = lines.findIndex((l) => l.startsWith("@paragraphs "));
		const wordLines = lines.slice(wordsIdx + 1, parasIdx);
		expect(wordLines.length).toBe(idx.listEntries().length);
		for (const w of wordLines) expect(w).not.toContain("\n");
	});
});
