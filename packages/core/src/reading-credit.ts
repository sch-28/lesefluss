import { MAX_PLAUSIBLE_WPM } from "./reading-rates";

export type ReadingMode = "rsvp" | "scroll" | "page";

/**
 * Rate above which forward movement is traversal, not reading. Measured
 * sittings sit at a median of 242 and a 95th percentile of 533 WPM, so
 * anything sustained above this is ground crossed rather than read.
 */
export const SANE_WPM_CEILING = 800;

/**
 * Headroom over the configured dial for RSVP. The engine delivers well under
 * nominal, so the dial is an upper bound on honest progress, not a target.
 */
export const RSVP_DIAL_HEADROOM = 1.25;

/**
 * Words the credit bucket may hold. Position advances in bursts even when
 * reading honestly: a page turn moves a page at once, after a minute of
 * stillness. The bucket refills while the reader is on a page and drains at
 * the turn, so occasional bursts pass and sustained motion does not.
 */
export const CREDIT_BURST_WORDS = 500;

/** The fastest pace credited for this mode. A dial is clamped to the global cap, so a forged one buys nothing. */
export function creditCeilingWpm(mode: ReadingMode, dial: number | null): number {
	if (mode !== "rsvp" || dial === null || dial <= 0) return SANE_WPM_CEILING;
	return Math.min(dial * RSVP_DIAL_HEADROOM, MAX_PLAUSIBLE_WPM);
}

/** The bucket after `elapsedMs` of reading at most at the mode's ceiling. */
export function refillCredit(
	budget: number,
	mode: ReadingMode,
	dial: number | null,
	elapsedMs: number,
): number {
	return Math.min(
		CREDIT_BURST_WORDS,
		budget + (creditCeilingWpm(mode, dial) * Math.max(0, elapsedMs)) / 60_000,
	);
}

/**
 * Whole words credited for moving from `from` to `to`, and the bucket left.
 * Moving backwards reads nothing; a burst larger than the bucket is credited
 * only up to what the bucket holds.
 */
export function spendCredit(
	budget: number,
	from: number,
	to: number,
): { credited: number; budget: number } {
	const credited = Math.floor(Math.min(to - from, budget));
	if (credited <= 0) return { credited: 0, budget };
	return { credited, budget: budget - credited };
}
