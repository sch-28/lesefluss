import type { MeasuredReadingMode, ReadingMode } from "./reading-credit";

/**
 * Reading-rate arithmetic shared by the app's stats, the website and the
 * social profile: which sittings can be trusted for a speed, and how serial
 * chapters fold into one work.
 */

/** Below this a sitting is too short for its rate to mean anything. */
export const MIN_MEASURABLE_MS = 1000;

/**
 * Above this a sitting is not reading. Jumping the position (a table-of-contents
 * tap, a fling-scroll, a resync) credits thousands of words against seconds of
 * active time, and because every speed figure here is words-weighted, one such
 * row outvotes a hundred real ones. Real sittings on the device DB top out around
 * 600 wpm; the offenders sit between 2,000 and 49,000.
 *
 * Trained speed-readers reach roughly 1,000 wpm, so this leaves generous headroom
 * above anything a person can actually do while still catching position jumps.
 */
export const MAX_PLAUSIBLE_WPM = 1500;

/**
 * Whether a sitting's *rate* can be trusted. Deliberately not a filter on the
 * sitting itself: the words were read and the time was spent, so they still count
 * toward totals. Only the derived speed is discarded.
 */
export function isPlausibleRate(words: number, durationMs: number): boolean {
	if (durationMs <= MIN_MEASURABLE_MS || words <= 0) return false;
	return words / (durationMs / 60_000) <= MAX_PLAUSIBLE_WPM;
}

/**
 * Whether a sitting measures this reader's speed. Listening moves at the voice's
 * pace, so its words and time count toward totals, streaks and goals but never
 * toward a speed.
 */
export function isMeasurableSitting<
	T extends { mode: ReadingMode; wordsRead: number; durationMs: number },
>(row: T): row is T & { mode: MeasuredReadingMode } {
	return row.mode !== "listen" && isPlausibleRate(row.wordsRead, row.durationMs);
}

/** A scroll or page sitting above this is skimming, whatever the reader's own pace. */
export const SKIM_MAX_READING_WPM = 600;

/** A scroll or page sitting this far above the reader's own median sitting is skimming. */
export const SKIM_MEDIAN_FACTOR = 1.6;

/** Fewer sittings than this give no median worth comparing against. */
export const SKIM_MEDIAN_MIN_SITTINGS = 5;

type RateRow = { mode: ReadingMode; wordsRead: number; durationMs: number };

function sittingWpm(row: RateRow): number {
	return row.wordsRead / (row.durationMs / 60_000);
}

/**
 * The speed above which a scroll or page sitting counts as skimmed, from these
 * rows: the hard cap, or 1.6x the median sitting when there are enough sittings
 * under the cap. RSVP runs at its dial and is never skimmed.
 */
export function skimCutoffWpm(rows: readonly RateRow[]): number {
	const rates: number[] = [];
	for (const r of rows) {
		if (r.mode !== "scroll" && r.mode !== "page") continue;
		if (!isPlausibleRate(r.wordsRead, r.durationMs)) continue;
		const wpm = sittingWpm(r);
		if (wpm <= SKIM_MAX_READING_WPM) rates.push(wpm);
	}
	if (rates.length < SKIM_MEDIAN_MIN_SITTINGS) return SKIM_MAX_READING_WPM;
	rates.sort((a, b) => a - b);
	const mid = rates.length >> 1;
	const median = rates.length % 2 ? rates[mid] : (rates[mid - 1] + rates[mid]) / 2;
	return Math.min(SKIM_MAX_READING_WPM, median * SKIM_MEDIAN_FACTOR);
}

/**
 * Whether a sitting was skimmed: its time, words and streak still count, but it
 * never feeds a speed or an average.
 */
export function isSkimmedSitting(row: RateRow, cutoffWpm: number): boolean {
	if (row.mode !== "scroll" && row.mode !== "page") return false;
	if (!isPlausibleRate(row.wordsRead, row.durationMs)) return false;
	return sittingWpm(row) > cutoffWpm;
}

/** The sittings a speed is computed from: measurable and not skimmed, judged against these rows. */
export function speedSittings<T extends RateRow>(
	rows: readonly T[],
	cutoffWpm: number = skimCutoffWpm(rows),
): (T & { mode: MeasuredReadingMode })[] {
	return rows.filter(
		(r): r is T & { mode: MeasuredReadingMode } =>
			isMeasurableSitting(r) && !isSkimmedSitting(r, cutoffWpm),
	);
}

export interface BookTotals {
	bookId: string;
	seriesId: string | null;
	title: string;
	author: string | null;
	wordCount: number;
	wordPosition: number;
	durationMs: number;
}

export interface WorkTotals {
	workId: string;
	isSeries: boolean;
	title: string;
	author: string | null;
	wordCount: number;
	/** How far into the work the reader is overall, not what they read in the
	 *  selected period. Lets a card say "34% read" without the figure changing
	 *  meaning when the period changes. */
	wordPosition: number;
	durationMs: number;
}

/**
 * Fold per-book totals into per-work totals, longest first.
 *
 * Every chapter of a serial is its own book row, so without this one
 * 400-chapter web novel fills the whole list and no single-file book can rank
 * against it.
 */
export function rollUpWorks(rows: BookTotals[]): WorkTotals[] {
	const works = new Map<string, WorkTotals>();

	for (const row of rows) {
		const isSeries = row.seriesId != null && row.seriesId !== "";
		const workId = isSeries ? (row.seriesId as string) : row.bookId;
		const existing = works.get(workId);
		if (existing) {
			existing.durationMs += Number(row.durationMs);
			continue;
		}
		works.set(workId, {
			workId,
			isSeries,
			title: row.title,
			author: row.author,
			// A serial's length is the sum of its chapters, fetched separately;
			// counting the one chapter seen here would understate it.
			wordCount: isSeries ? 0 : row.wordCount,
			wordPosition: isSeries ? 0 : row.wordPosition,
			durationMs: Number(row.durationMs),
		});
	}

	return [...works.values()].sort((a, b) => b.durationMs - a.durationMs);
}
