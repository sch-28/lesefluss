import { describe, expect, it } from "vitest";
import { buildChapterHeadingMap } from "./chapter-headings";

describe("buildChapterHeadingMap", () => {
	it("injects the TOC title when the chapter's paragraph has no heading", () => {
		const chapters = [
			{ title: "Prologue", startWord: 0 },
			{ title: "Chapter 1", startWord: 3 },
		];
		const paragraphs = ["Deep in darkness.", "More prologue.", "Body.", "Chapter one body."];
		const paragraphStartWords = [0, 2, 3, 5];
		const map = buildChapterHeadingMap(chapters, paragraphs, paragraphStartWords);
		expect(map.get(0)).toBe("Prologue");
		expect(map.get(2)).toBe("Chapter 1");
		expect(map.size).toBe(2);
	});

	it("skips chapters whose paragraph already starts with a heading", () => {
		const chapters = [{ title: "Chapter 1: Only the Dark", startWord: 0 }];
		const paragraphs = ["# Chapter 1: Only the Dark", "Deep in darkness."];
		const starts = [0, 5];
		const map = buildChapterHeadingMap(chapters, paragraphs, starts);
		expect(map.size).toBe(0);
	});

	it("skips chapters that start mid-paragraph (not at a paragraph boundary)", () => {
		const chapters = [{ title: "Chapter 1", startWord: 3 }];
		const paragraphs = ["A long paragraph that spans several words here."];
		const starts = [0];
		const map = buildChapterHeadingMap(chapters, paragraphs, starts);
		expect(map.size).toBe(0);
	});

	it("returns an empty map when there are no chapters", () => {
		expect(buildChapterHeadingMap([], ["Body."], [0]).size).toBe(0);
	});
});
