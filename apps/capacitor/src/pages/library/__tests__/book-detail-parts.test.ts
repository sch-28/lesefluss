import { describe, expect, it } from "vitest";
import { readableSubjects } from "../../_shared/readable-subjects";
import { COLLAPSED_CHAPTERS, collapsedRange } from "../book-chapters";
import { openReaderLabel } from "../open-reader-label";

const chapters = [
	{ title: "One", startWord: 0 },
	{ title: "Two", startWord: 1_000 },
	{ title: "Three", startWord: 2_000 },
];

describe("openReaderLabel", () => {
	it("names the time left, with the chapter apart so a narrow button can drop it", () => {
		expect(
			openReaderLabel({ wordPosition: 1_500, wordCount: 3_000, finishedAt: null }, chapters, 84),
		).toEqual({ label: "Continue · 1h 24m left", detail: "Two" });
	});

	it("leaves out what it does not know", () => {
		const book = { wordPosition: 1_500, wordCount: 3_000, finishedAt: null };
		expect(openReaderLabel(book, [], null)).toEqual({ label: "Continue" });
		// Legacy byte offsets past the end: no chapter to name.
		expect(openReaderLabel(book, [{ title: "X", startWord: 9_000 }], 5)).toEqual({
			label: "Continue · 5 min left",
		});
	});

	it("starts an unread book and opens a finished one", () => {
		expect(
			openReaderLabel({ wordPosition: 0, wordCount: 3_000, finishedAt: null }, chapters, 9),
		).toEqual({ label: "Start reading" });
		expect(
			openReaderLabel({ wordPosition: 3_000, wordCount: 3_000, finishedAt: 1 }, chapters, 0),
		).toEqual({ label: "Open reader" });
	});
});

describe("collapsedRange", () => {
	it("shows every chapter of a short book", () => {
		expect(collapsedRange(4, 3)).toEqual([0, 4]);
	});

	it("keeps one chapter before the current one and stays inside the list", () => {
		expect(collapsedRange(40, 10)).toEqual([9, 9 + COLLAPSED_CHAPTERS]);
		expect(collapsedRange(40, 0)).toEqual([0, COLLAPSED_CHAPTERS]);
		expect(collapsedRange(40, 39)).toEqual([40 - COLLAPSED_CHAPTERS, 40]);
	});
});

describe("readableSubjects", () => {
	it("splits library headings into tags, once each", () => {
		expect(
			readableSubjects([
				"Villages--France--Fiction",
				"Love stories -- Fiction",
				"Fiction, Historical",
			]),
		).toEqual(["Villages", "France", "Fiction", "Love stories", "Fiction, Historical"]);
	});
});
