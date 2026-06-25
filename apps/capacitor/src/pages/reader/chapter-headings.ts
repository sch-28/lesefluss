import { paragraphIndexForWord } from "@lesefluss/core";
import { getHeadingLevel } from "./paragraph";

/**
 * Map paragraph index → chapter title to render as an inline header above that
 * paragraph.
 *
 * The reader renders chapter headers from `# `-prefixed lines in `content`.
 * Older imports (and EPUBs whose chapter titles were images rather than
 * `<h1>`-`<h6>` tags) have no such line at the chapter start, so a TOC jump
 * shows no header. The TOC label is still stored per chapter, so we fall back
 * to rendering it inline without re-importing the book.
 *
 * A title is emitted only when the chapter starts exactly at a paragraph
 * boundary and that paragraph has no heading of its own. The second guard keeps
 * headers from doubling up on books that already have one (real heading tags or
 * the importer-injected `# ` line).
 */
export function buildChapterHeadingMap(
	chapters: readonly { title: string; startWord: number }[],
	paragraphs: readonly string[],
	paragraphStartWords: readonly number[],
): Map<number, string> {
	const map = new Map<number, string>();
	if (chapters.length === 0 || paragraphs.length === 0) return map;
	for (const ch of chapters) {
		const idx = paragraphIndexForWord(paragraphStartWords as number[], ch.startWord);
		if (paragraphStartWords[idx] === ch.startWord && getHeadingLevel(paragraphs[idx]) === 0) {
			map.set(idx, ch.title);
		}
	}
	return map;
}
