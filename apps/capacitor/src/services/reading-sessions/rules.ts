import type { ReadingMode, WordPosition } from "@lesefluss/core";

/** A pause longer than this ends a sitting; the next activity opens a new one. */
export const HARD_END_MS = 10 * 60_000;
/**
 * A sitting shorter or smaller than this is not written. It is also the bar for
 * a "real sitting": a written row moves the book's status on, so opening a book
 * and glancing at it counts for nothing.
 */
export const MIN_DURATION_MS = 60_000;
export const MIN_WORDS = 5;

/** Active reading time behind each entry of a row's `segmentWpm`. */
export const SEGMENT_MS = 10 * 60_000;

export type SessionRow = {
	id: string;
	bookId: string;
	mode: ReadingMode;
	startedAt: number;
	endedAt: number;
	durationMs: number;
	wordsRead: number;
	startWord: WordPosition;
	endWord: WordPosition;
	/** Null when nothing in the sitting counts as read, e.g. all of it rewound as browsing. */
	furthestWord: WordPosition | null;
	wpmAvg: number | null;
	/** Reader font size, or the RSVP word size; null where no text is shown (listening). */
	fontSize: number | null;
	/** wpm over each full SEGMENT_MS of active reading, in order; null before the first. */
	segmentWpm: number[] | null;
	updatedAt: number;
};

export type PersistKind = "checkpoint" | "flush";
