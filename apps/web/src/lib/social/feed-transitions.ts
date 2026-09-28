import { bookStatus, FEED_FINISH_RECENCY_HOURS, type FeedEventType } from "@lesefluss/core";

export type FeedBookState = {
	bookId: string;
	status: string | null;
	wordPosition: number;
	wordCount: number | null;
	finishedAt: Date | null;
	deleted: boolean;
	seriesId: string | null;
	source: string | null;
};

export type FeedTransition = { bookId: string; type: FeedEventType };

const HOUR_MS = 3_600_000;

function derivedStatus(book: FeedBookState) {
	return bookStatus({
		status: book.status,
		wordPosition: book.wordPosition,
		wordCount: book.wordCount ?? 0,
	});
}

/**
 * The feed-worthy changes between the stored rows and the rows a sync push
 * left behind. A book the server has never seen (first sync, restore, import)
 * emits nothing, and a finish only counts while it is recent, so history
 * reaching the server late never looks like news.
 */
export function feedTransitions(
	before: ReadonlyMap<string, FeedBookState>,
	after: readonly FeedBookState[],
	now: Date,
): FeedTransition[] {
	const out: FeedTransition[] = [];
	for (const next of after) {
		const prev = before.get(next.bookId);
		if (!prev || next.deleted || next.seriesId !== null || next.source === "url") continue;
		const was = derivedStatus(prev);
		const is = derivedStatus(next);
		if (was === "want" && is === "reading") out.push({ bookId: next.bookId, type: "started" });
		const becameFinished =
			is === "finished" &&
			(was !== "finished" || (prev.finishedAt === null && next.finishedAt !== null));
		const finishedAt = next.finishedAt ?? now;
		const isRecent = now.getTime() - finishedAt.getTime() <= FEED_FINISH_RECENCY_HOURS * HOUR_MS;
		if (becameFinished && isRecent) out.push({ bookId: next.bookId, type: "finished" });
	}
	return out;
}
