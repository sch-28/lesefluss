import type { QueryClient } from "@tanstack/react-query";
import { bookKeys, isBookPayloadKey, statsKeys } from "../../services/db/hooks/query-keys";
import { HOLD_MAX_MS, holdSummaryUntil } from "../../services/reading-sessions/summary-store";

const LEAVE_WINDOW_MS = 1000;
let lastLeaveAt = Number.NEGATIVE_INFINITY;

/** True right after leaving the reader, whose leave already refreshes the library's books. */
export function isLeavingReader() {
	return performance.now() - lastLeaveAt < LEAVE_WINDOW_MS;
}

/**
 * Refreshes what leaving the reader changed: the library's books and the book's goal plan,
 * both once `committed` lands, so the refetch reads the new position. The device can't
 * cancel a query, so a refetch that would only repeat one already queued is skipped: the
 * router's re-mount leaves again without a save of its own. The text and word index stay
 * cached: the position never changes them and a big book's reload takes seconds.
 */
export function refreshAfterLeaving(
	qc: QueryClient,
	bookId: string,
	committed: Promise<unknown>,
	{ isSaving }: { isSaving: boolean },
) {
	const isEcho = !isSaving && isLeavingReader();
	lastLeaveAt = performance.now();
	const landed = Promise.race([
		committed.catch(() => {}),
		new Promise((resolve) => setTimeout(resolve, HOLD_MAX_MS)),
	]);
	holdSummaryUntil(
		landed.then(() => {
			void qc.invalidateQueries({ queryKey: statsKeys.goalPlansOf(bookId) });
		}),
	);
	if (isEcho) return;
	void landed.then(() =>
		qc.invalidateQueries({
			queryKey: bookKeys.all,
			predicate: (q) => !isBookPayloadKey(q.queryKey),
		}),
	);
}
