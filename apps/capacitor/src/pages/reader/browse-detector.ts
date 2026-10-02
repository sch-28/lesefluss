import { SANE_WPM_CEILING } from "@lesefluss/core";
import { SOFT_IDLE_MS } from "./session-tracker";

export const BROWSE_MOVE_DISTANCE_WORDS = 2000;
// Headroom over the stats ceiling: a fast reader's single step can overshoot it.
const BROWSE_MAX_READING_WORDS_PER_MS = (1.5 * SANE_WPM_CEILING) / 60_000;

type Sample = { word: number; t: number };

type LongMoveDetector = {
	/** Returns the anchor when this settle completes a fast move. */
	record(from: number, to: number, now: number): number | null;
	reset(): void;
};

/**
 * Detects a manual scroll/page move too fast to be reading. A step between two
 * settles is fast when it covers more words than reading could in the time
 * between them; the move is the trailing run of fast steps, anchored at the
 * settle it left from. A settle whose `from` isn't the last recorded word (the
 * position moved some other way: RSVP, a device sync, a tap) starts a new
 * chain, so stale history can never trigger.
 */
export function createLongMoveDetector({
	distanceWords = BROWSE_MOVE_DISTANCE_WORDS,
	maxReadingWordsPerMs = BROWSE_MAX_READING_WORDS_PER_MS,
}: {
	distanceWords?: number;
	maxReadingWordsPerMs?: number;
} = {}): LongMoveDetector {
	// The trailing fast run, starting at the settle it left from.
	let samples: Sample[] = [];

	const isFast = (a: Sample, b: Sample) =>
		Math.abs(b.word - a.word) > (b.t - a.t) * maxReadingWordsPerMs;

	return {
		record(from, to, now) {
			// How long the reader rested at a chain's first word is unknown, so the
			// step leaving it counts as fast: an anchor may then sit one gesture
			// behind reading, never ahead of it.
			if (samples.at(-1)?.word !== from) samples = [{ word: from, t: now }];
			samples.push({ word: to, t: now });

			let start = samples.length - 1;
			while (start > 0 && isFast(samples[start - 1], samples[start])) start--;
			samples = samples.slice(start);

			const anchor = samples[0].word;
			return samples.length > 1 && Math.abs(to - anchor) >= distanceWords ? anchor : null;
		},
		reset() {
			samples = [];
		},
	};
}

/** How long reading must hold at a browsed spot before it counts as the
 *  reader's new place. */
export const BROWSE_RESUME_MS = 120_000;
const BROWSE_RESUME_SETTLES = 3;
/** A gap between settles longer than this is idling, not reading. */
export const BROWSE_STREAK_IDLE_CAP_MS = SOFT_IDLE_MS;

/** The reading done at the browsed spot, so it can count toward stats. */
export type ReadingStreak = { from: number; activeMs: number };

type ReadingResumeDetector = {
	/** Returns the reading streak once reading has resumed at the browsed spot. */
	record(from: number, to: number, now: number): ReadingStreak | null;
	/** Forgets the streak. A settle whose `from` isn't the last recorded word
	 *  (a jump, a tap) also starts over. */
	reset(): void;
};

/**
 * Detects that the user, while browsing, has settled into reading somewhere:
 * enough forward reading-paced settles over enough time with no fast move or
 * jump in between. Small backward steps (re-reading a line) are neutral.
 */
export function createReadingResumeDetector({
	resumeMs = BROWSE_RESUME_MS,
	resumeSettles = BROWSE_RESUME_SETTLES,
	maxReadingWordsPerMs = BROWSE_MAX_READING_WORDS_PER_MS,
	idleCapMs = BROWSE_STREAK_IDLE_CAP_MS,
}: {
	resumeMs?: number;
	resumeSettles?: number;
	maxReadingWordsPerMs?: number;
	idleCapMs?: number;
} = {}): ReadingResumeDetector {
	let last: Sample | null = null;
	let since = 0;
	let readingSettles = 0;
	let streak: ReadingStreak | null = null;

	const restart = (now: number) => {
		since = now;
		readingSettles = 0;
		streak = null;
	};

	return {
		record(from, to, now) {
			if (last?.word !== from) {
				restart(now);
			} else {
				// An idle gap can't buy a big step: past the cap it was a jump, not reading.
				const dt = Math.min(now - last.t, idleCapMs);
				const step = to - from;
				if (Math.abs(step) > dt * maxReadingWordsPerMs) {
					since = now;
					readingSettles = 0;
					streak = null;
				} else {
					if (step > 0) readingSettles++;
					if (streak) streak.activeMs += dt;
				}
			}
			streak ??= { from: to, activeMs: 0 };
			last = { word: to, t: now };
			if (readingSettles < resumeSettles || now - since < resumeMs) return null;
			return { from: streak.from, activeMs: Math.round(streak.activeMs) };
		},
		reset() {
			last = null;
			streak = null;
			readingSettles = 0;
		},
	};
}
