/**
 * Percent of a book read before it counts as finished. Books rarely end at
 * 100%: back matter, acknowledgements and licence text sit past the last of the
 * prose, so a reader who has finished reading often stops short of the end.
 */
export const FINISHED_PERCENT_THRESHOLD = 95;

/** Structural rather than `Book`, so aggregated works (a rolled-up serial) share
 *  the one clamped formula instead of re-deriving it. */
export function readingProgress(work: { wordCount: number; wordPosition: number }): number {
	if (work.wordCount <= 0) return 0;
	return Math.min(100, Math.round((work.wordPosition / work.wordCount) * 100));
}

export function isFinishedPercent(percent: number): boolean {
	return percent >= FINISHED_PERCENT_THRESHOLD;
}
