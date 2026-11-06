/**
 * Everything the book detail card shows about one book's progress, derived in
 * one place. Pure so the arithmetic can be tested without a renderer: the
 * finished threshold, the page clamp and the time-remaining estimate are all
 * rules rather than layout.
 */
import { isMeasuredPace, type Pace, readingProgress } from "@lesefluss/core";
import { bookPageCount, estimateMinutesLeft, estimatePages } from "../../utils/reading-time";

export interface BookProgressInput {
	seriesId: string | null;
	wordCount: number;
	wordPosition: number;
	/** Set on the first crossing of the finished threshold and never cleared. */
	finishedAt: number | null;
}

export interface BookReadingSummary {
	/** Null when a page count would mislead, i.e. for a serial chapter. */
	totalPages: number | null;
	pagesIn: number;
	percent: number;
	isFinished: boolean;
	paceWpm: number;
	/** True when `paceWpm` is the generic figure rather than this reader's. */
	isPaceEstimated: boolean;
	/** Null when the book is finished or its length is unknown. */
	minutesLeft: number | null;
}

export function summariseBookReading(
	book: BookProgressInput,
	/** `bookPace` from the speed model. */
	pace: Pace,
): BookReadingSummary {
	const totalPages = bookPageCount(book);
	// Clamped to the total: a re-import or a synced position can leave the reader
	// past the last word, and "Page 5 of 4" is worse than a rounded-down page.
	const pagesIn = totalPages === null ? 0 : Math.min(totalPages, estimatePages(book.wordPosition));

	// Read from the stamp rather than recomputed from position. `finished_at` is
	// only ever set, never cleared, so reopening a finished book and scrolling
	// back does not unfinish it. Recomputing would flip the card to "time left"
	// while the finished date rendered right beside it.
	const isFinished = book.finishedAt !== null;

	return {
		totalPages,
		pagesIn,
		percent: readingProgress(book),
		isFinished,
		paceWpm: pace.wpm,
		isPaceEstimated: !isMeasuredPace(pace),
		minutesLeft: estimateMinutesLeft(book, pace.wpm),
	};
}
