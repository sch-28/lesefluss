import { useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useRef } from "react";
import { queries } from "../../services/db/queries";
import type { Book } from "../../services/db/schema";
import { log } from "../../utils/log";

/**
 * Move the reader between chapters of a series.
 *
 * `tryAdvance` is called automatically by RSVP `onFinished` and scroll-settle
 * when the user reaches end-of-content; it's also wired to the explicit
 * "Next chapter" footer button and the header's right chevron. `tryRetreat`
 * is the manual-only counterpart, fired by the header's left chevron — there
 * is no automatic path backwards.
 *
 * A single re-entrancy guard covers both directions: the auto + manual
 * advance paths can fire back-to-back during the navigation transition,
 * and a rapid prev/next double-tap should land on the right chapter rather
 * than racing two replaces.
 *
 * Both directions navigate with `replace: true` (not push) so the back button
 * always returns to the library, not chapter N-1, N-2, etc. Readers who want
 * to revisit a specific chapter go through the series-detail chapter list.
 *
 * No-op for standalone books and at series boundaries (last chapter for
 * `tryAdvance`, chapter 0 for `tryRetreat`).
 *
 * Return value is memoized so callers (`useCallback` deps in BookReader)
 * don't re-create their handlers every render.
 */
export function useChapterAutoAdvance(book: Book | undefined): {
	tryAdvance: () => Promise<void>;
	tryRetreat: () => Promise<void>;
} {
	const navigate = useNavigate();
	const navigatingRef = useRef(false);

	const advance = useCallback(
		async (direction: "next" | "prev") => {
			if (navigatingRef.current) return;
			if (!book?.seriesId || book.chapterIndex == null) return;
			if (direction === "prev" && book.chapterIndex <= 0) return;
			navigatingRef.current = true;
			try {
				const target =
					direction === "next"
						? await queries.getNextChapter(book.seriesId, book.chapterIndex)
						: await queries.getPreviousChapter(book.seriesId, book.chapterIndex);
				if (target) {
					log("reader", `${direction} ${book.id} → ${target.id} (chapter ${target.chapterIndex})`);
					navigate({ to: "/tabs/reader/$id", params: { id: target.id }, replace: true });
				}
			} finally {
				navigatingRef.current = false;
			}
		},
		[book?.id, book?.seriesId, book?.chapterIndex, navigate],
	);

	const tryAdvance = useCallback(() => advance("next"), [advance]);
	const tryRetreat = useCallback(() => advance("prev"), [advance]);

	return useMemo(() => ({ tryAdvance, tryRetreat }), [tryAdvance, tryRetreat]);
}
