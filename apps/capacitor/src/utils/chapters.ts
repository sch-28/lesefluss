import type { Chapter } from "../services/db/schema";

/**
 * Chapter offsets are word positions (ADR-0002) for anything imported after the
 * word-position migration. Books imported before it kept byte offsets in
 * `book_content.chapters`: migration 0027 dropped the byte *columns* but never
 * rewrote this JSON, so both units are in the wild.
 *
 * Byte offsets are roughly 5x larger than the word count, so a chapter starting
 * past the end of the book is the tell. Treating one as a word position sends
 * the reader somewhere arbitrary and, because a jump writes `wordPosition`,
 * overwrites a real reading position with nonsense.
 */
export function hasWordAlignedChapters(chapters: Chapter[], wordCount: number): boolean {
	if (chapters.length === 0 || wordCount <= 0) return false;
	return chapters.every((chapter) => chapter.startWord >= 0 && chapter.startWord < wordCount);
}

/**
 * Index of the chapter containing `wordPosition`: the last one starting at or
 * before it. Returns 0 for a position before the first chapter starts.
 */
export function currentChapterIndex(chapters: Chapter[], wordPosition: number): number {
	let index = 0;
	for (let i = 0; i < chapters.length; i++) {
		if ((chapters[i]?.startWord ?? 0) <= wordPosition) index = i;
		else break;
	}
	return index;
}
