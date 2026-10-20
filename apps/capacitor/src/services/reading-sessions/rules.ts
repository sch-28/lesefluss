import type { ReadingMode, WordPosition } from "@lesefluss/core";

/** A pause longer than this ends a sitting; the next activity opens a new one. */
export const HARD_END_MS = 10 * 60_000;
/** A sitting shorter or smaller than this is not written. */
export const MIN_DURATION_MS = 5_000;
export const MIN_WORDS = 5;

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
	updatedAt: number;
};

export type PersistKind = "checkpoint" | "flush";
