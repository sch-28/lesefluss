import type { DiscussionItem } from "@lesefluss/core";
import { describe, expect, it } from "vitest";
import type { ShownChapter } from "@/utils/chapters";
import { chapterAnchorOptions, discussionChapterIndex } from "../discussion-chapters";

// An older import: each chapter stored one word early, on the previous chapter's last word.
const chapters: ShownChapter[] = [
	{ title: "One", startWord: 0, storedStartWord: 0 },
	{ title: "Two", startWord: 50, storedStartWord: 49 },
	{ title: "Three", startWord: 100, storedStartWord: 99 },
];

function item(anchorKind: "range" | "chapter", startWord: number): DiscussionItem {
	return {
		id: "c",
		kind: "comment",
		anchorKind,
		author: null,
		isOwn: true,
		startWord,
		endWord: startWord,
		startCharInWord: 0,
		endCharInWord: 0,
		createdAt: 0,
		reactions: [],
		body: "b",
		editedAt: null,
		removed: false,
		replies: [],
	};
}

describe("discussionChapterIndex", () => {
	it("files a chapter comment anchored on a stored start under that chapter, not the previous one", () => {
		expect(discussionChapterIndex(item("chapter", 49), chapters)).toBe(1);
		expect(discussionChapterIndex(item("chapter", 99), chapters)).toBe(2);
	});

	it("files a chapter comment from a reader whose book stores the start on the heading", () => {
		expect(discussionChapterIndex(item("chapter", 50), chapters)).toBe(1);
	});

	it("files a positioned comment by where it is", () => {
		expect(discussionChapterIndex(item("range", 49), chapters)).toBe(0);
		expect(discussionChapterIndex(item("range", 50), chapters)).toBe(1);
	});
});

describe("discussionChapterIndex with a part and its first chapter", () => {
	// Stored early: the part on the previous chapter's last word, Chapter 1 on the part's number.
	const partAndChapter: ShownChapter[] = [
		{ title: "Prologue", startWord: 0, storedStartWord: 0 },
		{ title: "Part I", startWord: 2, storedStartWord: 1 },
		{ title: "Chapter 1", startWord: 3, storedStartWord: 2 },
	];

	it("files a comment on a stored start under the chapter stored there, before any shown start", () => {
		expect(discussionChapterIndex(item("chapter", 2), partAndChapter)).toBe(2);
		expect(discussionChapterIndex(item("chapter", 1), partAndChapter)).toBe(1);
	});
});

describe("chapterAnchorOptions", () => {
	it("posts a chapter comment on the start the server knows, the stored one", () => {
		expect(chapterAnchorOptions(chapters).map((o) => o.value)).toEqual(["0", "49", "99"]);
	});
});
