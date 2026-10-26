import type { DiscussionItem } from "@lesefluss/core";
import { currentChapterIndex, type ShownChapter } from "@/utils/chapters";

/**
 * The chapter a discussion item belongs to. A chapter comment is anchored on the
 * chapter's stored start, the one the server checks it against, and an older
 * import stores that start one word early, on the previous chapter's last word.
 * So it is matched on the start rather than placed by position; the start one
 * word on covers an author whose book stores it early while this one doesn't.
 */
export function discussionChapterIndex(item: DiscussionItem, chapters: ShownChapter[]): number {
	if (item.kind === "comment" && item.anchorKind === "chapter") {
		// In this order: a part and its first chapter can each match one of the others.
		const matches = [
			(c: ShownChapter) => c.storedStartWord === item.startWord,
			(c: ShownChapter) => c.startWord === item.startWord,
			(c: ShownChapter) => c.startWord === item.startWord + 1,
		];
		for (const match of matches) {
			const index = chapters.findIndex(match);
			if (index >= 0) return index;
		}
	}
	return currentChapterIndex(chapters, item.startWord);
}

/**
 * The chapters a comment can be about. The value is the chapter's stored start:
 * the server only accepts a chapter anchor that is one of its copy's starts, and
 * that copy keeps an older import's starts as they were pushed.
 */
export function chapterAnchorOptions(chapters: ShownChapter[]): { value: string; title: string }[] {
	return chapters.map((c) => ({ value: String(c.storedStartWord), title: c.title }));
}
