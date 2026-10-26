import { type WordIndex, wordPos } from "@lesefluss/core";
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

/**
 * A chapter as shown. `startWord` is the first word it shows; `storedStartWord`
 * is its start as stored, which is what the server knows the chapter by (a
 * chapter comment's anchor must be one of those).
 */
export type ShownChapter = Chapter & { storedStartWord: number };

export const asShownChapters = (chapters: Chapter[]): ShownChapter[] =>
	chapters.map((chapter) => ({ ...chapter, storedStartWord: chapter.startWord }));

const HEADING_MARKER = /^#{1,6} +$/;
const PARAGRAPH_LEAD = /^(#{1,6} +)?$/;

/**
 * Older imports mapped a chapter start on a heading's `# ` marker (not a word)
 * down to the previous paragraph's last word. Repaired on read rather than
 * migrated, because server copies of those chapters keep reaching new devices.
 *
 * A start moves to the next word when that word opens a heading with only the
 * marker before it and the stored word doesn't open its own paragraph. A start
 * on a one-word paragraph stays: older imports also started chapters on a
 * number paragraph before the title ("I", then "## The Boy"), and leaving a
 * floored one a word early is no worse than before. A later chapter sharing a
 * start with the one before it moves onto a heading right after that start,
 * when there is one.
 */
export function chaptersOnShownWords(
	chapters: Chapter[],
	wordIndex: Pick<WordIndex, "wordCount" | "charOf">,
	content: string,
): ShownChapter[] {
	/** The text between the start of the paragraph holding `word` and the word itself. */
	const leadOf = (word: number) => {
		const at = wordIndex.charOf(word);
		const paragraphStart = content.lastIndexOf("\n\n", at - 1);
		return content.slice(paragraphStart < 0 ? 0 : paragraphStart + 2, at);
	};
	const opensHeading = (word: number) =>
		word < wordIndex.wordCount && HEADING_MARKER.test(leadOf(word));
	const shown = chapters.map((chapter): ShownChapter => {
		const stored = chapter.startWord;
		const isFloored = opensHeading(stored + 1) && !PARAGRAPH_LEAD.test(leadOf(stored));
		return {
			...chapter,
			startWord: wordPos(isFloored ? stored + 1 : stored),
			storedStartWord: stored,
		};
	});
	for (let i = 1; i < shown.length; i++) {
		const previous = shown[i - 1].startWord;
		if (shown[i].startWord > previous) continue;
		const onward = previous + 1;
		if (opensHeading(onward) && !(shown[i + 1]?.startWord < onward)) {
			shown[i] = { ...shown[i], startWord: wordPos(onward) };
		}
	}
	return shown;
}
