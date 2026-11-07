/**
 * Personal bests, derived from rows the stats page already loads.
 *
 * Every figure here is a maximum, which makes them unusually sensitive to bad
 * data: one implausible sitting becomes "your fastest book" forever. Speed
 * records therefore run through the same plausibility gate as the rest of the
 * stats, and a book needs a meaningful amount of reading before it can hold the
 * speed record at all.
 */

import { type BookSpeed, bookSpeeds, type ReadingMode } from "@lesefluss/core";
import { localDateKey, startOfLocalDay } from "../../utils/date-utils";
import { sumDurationByLocalDay } from "./aggregate";

/** A book read for less than this cannot hold the speed record: a single fast
 *  minute is noise, not a pace. */
const MIN_TIME_FOR_SPEED_RECORD_MS = 10 * 60_000;

export interface RecordSession {
	bookId: string;
	mode: ReadingMode;
	startedAt: number;
	durationMs: number;
	wordsRead: number;
}

export interface RecordBook {
	id: string;
	title: string;
	wordCount: number;
	finishedAt: number | null;
	/** Non-null for a serial chapter. Chapters are `books` rows, so without this
	 *  one finished chapter of a web novel becomes "longest book finished". */
	seriesId: string | null;
}

export interface ReadingRecords {
	longestSitting: { durationMs: number; at: number; title: string } | null;
	bestDay: { durationMs: number; dayStart: number } | null;
	fastestBook: { wpm: number; title: string } | null;
	longestBookFinished: { words: number; title: string } | null;
}

export function summariseRecords(sessions: RecordSession[], books: RecordBook[]): ReadingRecords {
	const titleByBook = new Map(books.map((book) => [book.id, book.title]));

	let longestSitting: ReadingRecords["longestSitting"] = null;
	const msByDay = sumDurationByLocalDay(sessions);
	// `sumDurationByLocalDay` keys by date string; the record needs the epoch of
	// that local midnight to render it.
	const dayStartOf = new Map<string, number>();

	for (const session of sessions) {
		// Sessions outlive the books they belong to: deleting a book leaves its
		// rows behind. Time still counts toward the day totals, but a record that
		// names a book the reader can no longer open is not a record.
		const title = titleByBook.get(session.bookId);

		if (
			title !== undefined &&
			session.durationMs > 0 &&
			(longestSitting === null || session.durationMs > longestSitting.durationMs)
		) {
			longestSitting = { durationMs: session.durationMs, at: session.startedAt, title };
		}

		dayStartOf.set(localDateKey(session.startedAt), startOfLocalDay(session.startedAt));
	}

	// Kept in milliseconds so the caller formats once; rounding to minutes here
	// and multiplying back out rounded twice.
	let bestDay: ReadingRecords["bestDay"] = null;
	for (const [key, ms] of msByDay) {
		if (ms > 0 && (bestDay === null || ms > bestDay.durationMs)) {
			bestDay = { durationMs: ms, dayStart: dayStartOf.get(key) ?? 0 };
		}
	}

	const fastest = fastestBook(bookSpeeds(sessions), (id) => titleByBook.get(id));

	let longestBookFinished: ReadingRecords["longestBookFinished"] = null;
	for (const book of books) {
		// A serial's chapters are rows here too. Forty finished chapters is one
		// book, and the Finished shelf above already excludes them.
		if (book.seriesId !== null || book.finishedAt === null || book.wordCount <= 0) continue;
		if (longestBookFinished === null || book.wordCount > longestBookFinished.words) {
			longestBookFinished = { words: book.wordCount, title: book.title };
		}
	}

	return { longestSitting, bestDay, fastestBook: fastest, longestBookFinished };
}

/**
 * The fastest book, the one rule the Overview and the Speed tab share: the speed
 * model's per-book speed (plausible sittings only, RSVP included), from
 * {@link MIN_TIME_FOR_SPEED_RECORD_MS} on the book. A book without a title is
 * deleted and can't hold the record.
 */
export function fastestBook(
	speeds: Readonly<Record<string, BookSpeed>>,
	titleOf: (bookId: string) => string | undefined,
): { wpm: number; title: string } | null {
	let fastest: { wpm: number; title: string } | null = null;
	for (const [bookId, speed] of Object.entries(speeds)) {
		const title = titleOf(bookId);
		if (title === undefined || speed.activeMs < MIN_TIME_FOR_SPEED_RECORD_MS) continue;
		if (fastest === null || speed.wpm > fastest.wpm) fastest = { wpm: speed.wpm, title };
	}
	return fastest;
}
