import { estimateMinutes } from "@lesefluss/core";

export function formatReadingTime(minutes: number): string {
	if (minutes < 1) return "< 1 min";
	if (minutes < 60) return `${Math.round(minutes)} min`;
	const h = Math.floor(minutes / 60);
	const m = Math.round(minutes % 60);
	return m > 0 ? `${h}h ${m}m` : `${h}h`;
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

/** A percent with one decimal, as goal stats show it: "1.3". */
export function percentLabel(value: number): string {
	return (Math.round(value * 10) / 10).toFixed(1);
}

/** "10 min", "1h 5m", or "< 1 min". Never "~": an estimate says so only in a popover. */
export function minutesLabel(minutes: number): string {
	return formatReadingTime(minutes);
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
