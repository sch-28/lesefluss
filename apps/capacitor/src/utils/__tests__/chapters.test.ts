import { describe, expect, it } from "vitest";
import type { Chapter } from "../../services/db/schema";
import { currentChapterIndex, hasWordAlignedChapters } from "../chapters";

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
