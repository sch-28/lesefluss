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
const WORDS_PER_PAGE = 250;

/** Fallback when a reader has no measured history yet. Rough, and labelled as
 *  such wherever it is shown. */
export const AVERAGE_READER_WPM = 225;

export function estimatePages(wordCount: number): number {
	return Math.max(1, Math.ceil(wordCount / WORDS_PER_PAGE));
}
