import { useCallback, useMemo, useRef } from "react";
import { useHistory } from "react-router-dom";
import { queries } from "../../services/db/queries";
import type { Book } from "../../services/db/schema";
import { log } from "../../utils/log";

/**
 * Auto-advance the reader to the next chapter in a series. The reader's
 * existing handlers (RSVP `onFinished`, scroll-settle) call `tryAdvance` once
 * when the user reaches end-of-content; a re-entrancy guard prevents both
 * paths from firing back-to-back during the navigation transition.
 *
 * Uses `history.replace` (not `push`) so the back button returns to the
 * library, not chapter N-1, N-2, … (typical reader-app convention; readers
 * who want to revisit go through the series detail page).
 *
 * No-op for standalone books and for the last chapter of a series.
 *
 * Return value is memoized so callers (`useCallback` deps in BookReader)
 * don't re-create their handlers every render.
 */
export function useChapterAutoAdvance(book: Book | undefined): {
	tryAdvance: () => Promise<void>;
} {
	const history = useHistory();
	const advancingRef = useRef(false);

	const tryAdvance = useCallback(async () => {
		if (advancingRef.current) return;
		if (!book?.seriesId || book.chapterIndex === null) return;
		advancingRef.current = true;
		try {
			const next = await queries.getNextChapter(book.seriesId, book.chapterIndex);
			if (next) {
				log("reader", `auto-advance ${book.id} → ${next.id} (chapter ${next.chapterIndex})`);
				history.replace(`/tabs/reader/${next.id}`);
			}
		} finally {
			advancingRef.current = false;
		}
	}, [book?.id, book?.seriesId, book?.chapterIndex, history]);

	return useMemo(() => ({ tryAdvance }), [tryAdvance]);
}
