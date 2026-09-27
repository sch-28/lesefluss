/**
 * Reading-rate arithmetic shared by the app's stats, the website and the
 * social profile: which sittings can be trusted for a speed, how fast a reader
 * actually reads, and how serial chapters fold into one work.
 */

export interface ReadingRates {
	/** Delivered ÷ target for RSVP. The engine spends time on punctuation pauses
	 *  and the acceleration ramp, so it delivers well under the dial. */
	rsvpDeliveredRatio: number | null;
	scrollWpm: number | null;
	pageWpm: number | null;
}

/** Measured when there is no history yet. See task-46.3: delivered lands around
 *  63% of nominal. */
export const DEFAULT_RSVP_DELIVERED_RATIO = 0.65;

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

export interface RateSession {
	mode: "rsvp" | "scroll" | "page";
	wpmAvg: number | null;
	wordsRead: number;
	durationMs: number;
}

/**
 * How fast this reader actually reads, per mode, for estimating time remaining.
 *
 * Words-weighted so a one-paragraph sitting cannot swing the estimate. Callers
 * pass the most recent sessions rather than all of them: the RSVP ratio moves
 * when the punctuation-delay settings change, and a lifetime average would take
 * months to catch up.
 */
export function summariseReadingRates(rows: RateSession[]): ReadingRates {
	let rsvpDeliveredWords = 0;
	let rsvpTargetWordsWpm = 0;
	let rsvpTargetWords = 0;
	let rsvpActiveMs = 0;
	const measured = new Map<"scroll" | "page", { words: number; activeMs: number }>();

	for (const r of rows) {
		if (!isPlausibleRate(r.wordsRead, r.durationMs)) continue;
		if (r.mode === "rsvp") {
			// Both halves of the ratio come from the same rows: counting a
			// dial-less session's words as delivered while excluding it from the
			// target divides one population by another.
			if (r.wpmAvg == null || r.wpmAvg <= 0) continue;
			rsvpDeliveredWords += r.wordsRead;
			rsvpActiveMs += r.durationMs;
			rsvpTargetWordsWpm += r.wpmAvg * r.wordsRead;
			rsvpTargetWords += r.wordsRead;
			continue;
		}
		const bucket = measured.get(r.mode) ?? { words: 0, activeMs: 0 };
		bucket.words += r.wordsRead;
		bucket.activeMs += r.durationMs;
		measured.set(r.mode, bucket);
	}

	const deliveredWpm = rsvpActiveMs > 0 ? rsvpDeliveredWords / (rsvpActiveMs / 60_000) : null;
	const targetWpm = rsvpTargetWords > 0 ? rsvpTargetWordsWpm / rsvpTargetWords : null;

	function wpmOf(mode: "scroll" | "page"): number | null {
		const bucket = measured.get(mode);
		if (!bucket || bucket.activeMs <= 0) return null;
		return Math.max(1, Math.round(bucket.words / (bucket.activeMs / 60_000)));
	}

	return {
		rsvpDeliveredRatio:
			deliveredWpm !== null && targetWpm !== null && targetWpm > 0
				? deliveredWpm / targetWpm
				: null,
		scrollWpm: wpmOf("scroll"),
		pageWpm: wpmOf("page"),
	};
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

/**
 * One measured reading speed across every mode: words actually read per active
 * minute over the plausible sittings. Null when nothing measurable happened, so
 * a profile hides the figure instead of showing zero.
 */
export function measuredReadingSpeed(
	rows: readonly { wordsRead: number; durationMs: number }[],
): number | null {
	let words = 0;
	let activeMs = 0;
	for (const r of rows) {
		if (!isPlausibleRate(r.wordsRead, r.durationMs)) continue;
		words += r.wordsRead;
		activeMs += r.durationMs;
	}
	if (activeMs <= 0) return null;
	return Math.max(1, Math.round(words / (activeMs / 60_000)));
}
