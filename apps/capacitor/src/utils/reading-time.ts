import { estimateMinutes } from "@lesefluss/core";
import { formatDuration } from "./date-utils";

/** An estimate in `formatDuration`'s format, rounded rather than floored; "< 1 min" under a minute. */
export function formatReadingTime(minutes: number): string {
	if (minutes < 1) return "< 1 min";
	return formatDuration(Math.round(minutes) * 60_000);
}

/**
 * Words per page. Matches the figure this project already uses for the ESP32's
 * page simulation (AGENTS.md), and is in the range print editions assume.
 *
 * Deliberately not the reader's own pagination: that is measured from the user's
 * font size and screen, is chunk-local, and is never shown as a total. This is a
 * property of the book, so it has to be independent of the device.
 */
export const WORDS_PER_PAGE = 250;

export function estimatePages(wordCount: number): number {
	return Math.max(1, Math.ceil(wordCount / WORDS_PER_PAGE));
}

/**
 * Page count for a book, or null when one would mislead. Suppressed for serial
 * chapters: a page count per chapter says nothing about the work.
 */
export function bookPageCount(book: { seriesId: string | null; wordCount: number }): number | null {
	if (book.seriesId !== null || book.wordCount <= 0) return null;
	return estimatePages(book.wordCount);
}

/**
 * Minutes left in a book at a pace, or null when the book is finished or its
 * length is unknown. The one rule book detail, cards and rows use.
 */
export function estimateMinutesLeft(
	book: { wordCount: number; wordPosition: number; finishedAt: number | null },
	wpm: number,
): number | null {
	if (book.finishedAt !== null || book.wordCount <= 0) return null;
	return estimateMinutes(book.wordCount - book.wordPosition, wpm);
}
