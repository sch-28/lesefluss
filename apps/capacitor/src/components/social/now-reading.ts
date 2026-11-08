import { bookStatus } from "@lesefluss/core";

type NowReadingCandidate = {
	wordCount: number;
	wordPosition: number;
	status: string | null;
	finishedAt: number | null;
	seriesId: string | null;
	hideFromProfile: boolean;
	lastRead: number | null;
};

/** The book Social shows as "Now reading": on the Reading shelf, not hidden from the profile, read most recently. */
export function pickNowReading<T extends NowReadingCandidate>(books: readonly T[]): T | null {
	let best: T | null = null;
	for (const book of books) {
		if (book.seriesId || book.hideFromProfile || bookStatus(book) !== "reading") continue;
		if (!best || (book.lastRead ?? 0) > (best.lastRead ?? 0)) best = book;
	}
	return best;
}
