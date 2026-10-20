import { WordIndex, wordPos } from "@lesefluss/core";
import { describe, expect, it } from "vitest";
import { buildSegments, type SegmentSource, wordAtChar } from "../segments";

function source(content: string, extra: Partial<SegmentSource> = {}): SegmentSource {
	return { content, wordIndex: WordIndex.build(content), language: "en", chapters: [], ...extra };
}

function segmentsOf(content: string, startWord = 0, max = 100, extra: Partial<SegmentSource> = {}) {
	return buildSegments(source(content, extra), startWord, 0, max, true);
}

describe("buildSegments", () => {
	it("splits on sentence ends and paragraph breaks", () => {
		const segments = segmentsOf("One two. Three? Four\n\nFive six");
		expect(segments.map((s) => s.text)).toEqual(["One two.", "Three?", "Four", "Five six"]);
	});

	it("speaks the original text, not the folded word tokens", () => {
		const [segment] = segmentsOf("Er sagte „Hallo“ – und ging…", 0, 100, { language: "de" });
		expect(segment.text).toBe("Er sagte „Hallo“ – und ging…");
	});

	it("never speaks heading markers and keeps word offsets aligned", () => {
		const segments = segmentsOf("Intro.\n\n# Chapter One\n\nIt began.");
		expect(segments.map((s) => s.text)).toEqual(["Intro.", "Chapter One", "It began."]);
		const [, heading] = segments;
		expect(wordAtChar(heading, heading.text.indexOf("One"))).toBe(heading.words[1]);
	});

	it("starts mid-book and continues where the last segment ended", () => {
		const first = segmentsOf("A b. C d. E f.", 2, 1);
		expect(first).toHaveLength(1);
		expect(first[0].text).toBe("C d.");
		expect(segmentsOf("A b. C d. E f.", first[0].endWord)[0].text).toBe("E f.");
	});

	it("cuts an overlong sentence after a clause near the cap", () => {
		const words = Array.from({ length: 90 }, (_, i) => (i === 49 ? `w${i},` : `w${i}`));
		const segments = segmentsOf(`${words.join(" ")}.`);
		expect(segments.map((s) => s.words.length)).toEqual([50, 40]);
		expect(segments[0].text.endsWith("w49,")).toBe(true);
	});

	it("keeps run-on text under the engine's input limit", () => {
		const words = Array.from({ length: 50 }, () => "x".repeat(60));
		const segments = segmentsOf(words.join(" "));
		expect(segments.length).toBeGreaterThan(1);
		for (const segment of segments) expect(segment.text.length).toBeLessThanOrEqual(1500);
	});

	it("leaves a single huge word whole", () => {
		expect(segmentsOf("y".repeat(3000)).map((s) => s.text.length)).toEqual([3000]);
	});

	it("names the chapter only where one opens, plus a session's first segment", () => {
		const content = "One. Two.\n\nThree. Four.";
		const chapters = [
			{ title: "First", startWord: 0 },
			{ title: "Second", startWord: 2 },
		];
		const source_ = source(content, { chapters });
		const segments = buildSegments(source_, 1, 0, 100, false);
		expect(segments.map((s) => s.chapter)).toEqual([null, "Second", null]);
		expect(segments.map((s) => s.opensChapter)).toEqual([false, true, false]);
		// A session starting mid-chapter names it without claiming to open it.
		const [first] = buildSegments(source_, 1, 0, 100, true);
		expect(first).toMatchObject({ chapter: "First", opensChapter: false });
	});

	it("names the chapter on its opening segment and on the first segment built", () => {
		const content = "One. Two.\n\nThree. Four.";
		const chapters = [
			{ title: "First", startWord: 0 },
			{ title: "Second", startWord: 2 },
		];
		expect(segmentsOf(content, 0, 100, { chapters }).map((s) => s.chapter)).toEqual([
			"First",
			null,
			"Second",
			null,
		]);
		expect(segmentsOf(content, 1, 100, { chapters })[0].chapter).toBe("First");
	});
});

describe("wordAtChar", () => {
	it("maps an engine char offset to the spoken word", () => {
		const [segment] = segmentsOf("Hello brave world.");
		expect(wordAtChar(segment, 0)).toBe(wordPos(0));
		expect(wordAtChar(segment, 6)).toBe(wordPos(1));
		expect(wordAtChar(segment, 13)).toBe(wordPos(2));
	});
});
