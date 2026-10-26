import { useMemo } from "react";
import { queryHooks } from "../services/db/hooks";
import { parseChapters } from "../services/db/queries/books";
import { asShownChapters, chaptersOnShownWords, type ShownChapter } from "../utils/chapters";

/**
 * A book's chapters, each starting on the first word it shows. `isResolved` is
 * false while that is still being worked out: until then an older import can
 * start a chapter one word early, so nothing should be saved from a start yet.
 */
export function useBookChapters(bookId: string): {
	chapters: ShownChapter[];
	isResolved: boolean;
} {
	const { data: content } = queryHooks.useBookContent(bookId);
	const stored = useMemo(() => parseChapters(content?.chapters ?? null), [content?.chapters]);
	const wordIndex = queryHooks.useBookWordIndex(bookId, { enabled: stored.length > 0 });
	return useMemo(() => {
		if (stored.length === 0) return { chapters: [], isResolved: !!content };
		if (!content || !wordIndex.data) {
			// A failed index load can't repair the starts, so they stay unresolved.
			return {
				chapters: asShownChapters(stored),
				isResolved: wordIndex.isFetched && !wordIndex.isError,
			};
		}
		return {
			chapters: chaptersOnShownWords(stored, wordIndex.data, content.content),
			isResolved: true,
		};
	}, [stored, content, wordIndex.data, wordIndex.isFetched, wordIndex.isError]);
}
