import { WordIndex, wordPos } from "@lesefluss/core";
import { describe, expect, it } from "vitest";
import type { Chapter } from "../../services/db/schema";
import { chaptersOnShownWords, currentChapterIndex, hasWordAlignedChapters } from "../chapters";

function chapters(...starts: number[]): Chapter[] {
	return starts.map((startWord, i) => ({ title: `Chapter ${i + 1}`, startWord }));
}

describe("hasWordAlignedChapters", () => {
	it("accepts offsets that fall inside the book", () => {
		expect(hasWordAlignedChapters(chapters(0, 5_000, 40_000), 54_166)).toBe(true);
	});

	// Real data: Cat's Cradle is 54,166 words but its chapters run to 313,053,
	// and Red Rising is 130,362 words against offsets up to 694,196. Those are
	// byte offsets left behind by the word-position migration.
	it("rejects legacy byte offsets that run past the end of the book", () => {
		expect(hasWordAlignedChapters(chapters(0, 12_000, 313_053), 54_166)).toBe(false);
		expect(hasWordAlignedChapters(chapters(0, 300_000, 694_196), 130_362)).toBe(false);
	});

	it("rejects an offset exactly at the word count, which is past the last word", () => {
		expect(hasWordAlignedChapters(chapters(0, 54_166), 54_166)).toBe(false);
	});

	it("rejects a negative offset", () => {
		expect(hasWordAlignedChapters(chapters(-1, 100), 54_166)).toBe(false);
	});

	it("has nothing to trust when there are no chapters or no word count", () => {
		expect(hasWordAlignedChapters([], 54_166)).toBe(false);
		expect(hasWordAlignedChapters(chapters(0, 100), 0)).toBe(false);
	});
});

describe("currentChapterIndex", () => {
	it("picks the last chapter starting at or before the position", () => {
		const list = chapters(0, 100, 200, 300);
		expect(currentChapterIndex(list, 0)).toBe(0);
		expect(currentChapterIndex(list, 150)).toBe(1);
		expect(currentChapterIndex(list, 200)).toBe(2);
		expect(currentChapterIndex(list, 9_999)).toBe(3);
	});

	it("stays on the first chapter for a position before it starts", () => {
		expect(currentChapterIndex(chapters(50, 100), 10)).toBe(0);
	});

	it("returns 0 for an empty list rather than -1", () => {
		expect(currentChapterIndex([], 100)).toBe(0);
	});
});

describe("chaptersOnShownWords", () => {
	/** Shown starts for chapters stored at `stored` (words of `content`). */
	function shown(content: string, stored: Array<[title: string, word: string, nth?: number]>) {
		const wi = WordIndex.build(content);
		const entries = wi.listEntries();
		const word = (text: string, nth = 0) => {
			const at = entries.map((e, i) => (e.word === text ? i : -1)).filter((i) => i >= 0)[nth];
			if (at === undefined) throw new Error(`no word ${text}`);
			return at;
		};
		const chapters = stored.map(([title, text, nth]) => ({
			title,
			startWord: wordPos(word(text, nth)),
		}));
		const result = chaptersOnShownWords(chapters, wi, content);
		return {
			starts: result.map((c) => entries[c.startWord].word),
			stored: result.map((c) => c.storedStartWord),
			chapters,
		};
	}

	it("moves a start stored on the previous paragraph's last word onto the heading", () => {
		const r = shown("One two.\n\n# Chapter Two\n\nBody.", [["Chapter Two", "two."]]);
		expect(r.starts).toEqual(["Chapter"]);
		expect(r.stored).toEqual([r.chapters[0].startWord]);
	});

	it("does the same under a `## ` heading", () => {
		expect(shown("One two.\n\n## Part Two\n\nBody.", [["Part Two", "two."]]).starts).toEqual([
			"Part",
		]);
	});

	it("repairs two floored chapters in a row", () => {
		const content = "Intro end.\n\n# One\n\nFirst body.\n\n# Two\n\nSecond body.";
		const r = shown(content, [
			["One", "end."],
			["Two", "body.", 0],
		]);
		expect(r.starts).toEqual(["One", "Two"]);
	});

	it("leaves starts already on a heading, a body paragraph, or a one-word heading before another heading", () => {
		const content = "Last.\n\n# 2\n\n# TITLE 2\n\nBody text.";
		const r = shown(content, [
			["2: Second", "2"],
			["Body", "Body"],
		]);
		expect(r.starts).toEqual(["2", "Body"]);
	});

	it("leaves the last word of a paragraph followed by a plain paragraph, and the book's last word", () => {
		const r = shown("Some text.\n\nMore text", [
			["A", "text."],
			["B", "text", 0],
		]);
		expect(r.starts).toEqual(["text.", "text"]);
	});

	it("keeps a start on a one-word paragraph, even one stored early before its heading", () => {
		// Can't be told from a chapter that starts on its number (below); one word early is
		// what it was before the fix.
		const content = "Body.\n\nFin.\n\n# Chapter Two: The Sea\n\nNext.";
		expect(shown(content, [["Chapter Two: The Sea", "Fin."]]).starts).toEqual(["Fin."]);
	});

	it("keeps a chapter on its number paragraph before the title (imports before the injected heading)", () => {
		expect(shown("Prior end.\n\nI\n\n## The Boy\n\nBody.", [["The Boy", "I"]]).starts).toEqual([
			"I",
		]);
		expect(
			shown("Prior end.\n\nONE\n\n# The Boy Who Lived\n\nBody.", [["The Boy Who Lived", "ONE"]])
				.starts,
		).toEqual(["ONE"]);
	});

	it("never puts two chapters on one start: a part and its first chapter, both stored early", () => {
		const content = "Prior end.\n\n# I\n\n# Chapter 1\n\nBody.";
		const r = shown(content, [
			["Part I", "end."],
			["Chapter 1", "I"],
		]);
		expect(r.starts).toEqual(["I", "Chapter"]);
	});

	it("spreads a chain of one-word headings stored early onto their own headings", () => {
		const parts = shown("Prior end.\n\n# I\n\n# II\n\n# III\n\nBody.", [
			["I", "end."],
			["II", "I"],
			["III", "II"],
		]);
		expect(parts.starts).toEqual(["I", "II", "III"]);
		const numbers = shown("Prior end.\n\n# 5\n\n# 6\n\n# 7\n\nBody.", [
			["5", "end."],
			["6", "5"],
			["7", "6"],
		]);
		expect(numbers.starts).toEqual(["5", "6", "7"]);
	});

	it("leaves a new import's part and chapter alone", () => {
		const content = "Prior end.\n\n# I\n\n# Chapter 1\n\nBody.";
		const r = shown(content, [
			["Part I", "I"],
			["Chapter 1", "Chapter"],
		]);
		expect(r.starts).toEqual(["I", "Chapter"]);
	});
});
