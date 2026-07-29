/**
 * Percent of a book read before it counts as finished. Books rarely end at
 * 100%: back matter, acknowledgements and licence text sit past the last of the
 * prose, so a reader who has finished reading often stops short of the end.
 */
export const FINISHED_PERCENT_THRESHOLD = 95;

export function isFinishedPercent(percent: number): boolean {
	return percent >= FINISHED_PERCENT_THRESHOLD;
}
