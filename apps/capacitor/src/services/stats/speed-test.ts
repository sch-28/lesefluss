import { calcDelay, type RsvpSettings, wpmFrom } from "@lesefluss/core";
import { WORDS_PER_PAGE } from "../../utils/reading-time";

/** Outside this range the read round was most likely skimmed or left running. */
export const PLAUSIBLE_WPM = { min: 120, max: 900 } as const;

export const DIAL_STEP = 25;
export const DIAL_RANGE = { min: 250, max: 800 } as const;
const SUGGESTED_DIAL = { min: 300, max: 700 } as const;

/** Fewer RSVP words than this say nothing about a speed. */
export const MIN_RSVP_WORDS = 20;

export const COMPARISON_BOOK_WORDS = 300 * WORDS_PER_PAGE;

export function countWords(text: string): number {
	return text.split(/\s+/).filter(Boolean).length;
}

export function isPlausibleWpm(wpm: number): boolean {
	return wpm >= PLAUSIBLE_WPM.min && wpm <= PLAUSIBLE_WPM.max;
}

function clamp(value: number, range: { min: number; max: number }): number {
	return Math.min(range.max, Math.max(range.min, value));
}

/** RSVP runs about half again as fast as reading the page. */
export function suggestDial(readingWpm: number): number {
	return clamp(Math.round((readingWpm * 1.5) / DIAL_STEP) * DIAL_STEP, SUGGESTED_DIAL);
}

export function stepDial(dial: number, direction: 1 | -1): number {
	return clamp(dial + direction * DIAL_STEP, DIAL_RANGE);
}

/** Each word's display time at the dial, as the reader shows it. */
export function rsvpDelays(words: readonly string[], settings: RsvpSettings): number[] {
	let acceleration = 0;
	return words.map((word) => {
		const { delayMs, nextAcceleration } = calcDelay(word, settings, acceleration);
		acceleration = nextAcceleration;
		return delayMs;
	});
}

/** Words shown over the time they were on screen; null below `MIN_RSVP_WORDS`. */
export function rsvpWpm(delays: readonly number[], wordsShown: number): number | null {
	if (wordsShown < MIN_RSVP_WORDS) return null;
	const ms = delays.slice(0, wordsShown).reduce((sum, d) => sum + d, 0);
	return wpmFrom(wordsShown, ms);
}

/** RSVP over reading, as a whole percent. */
export function fasterPercent(readingWpm: number, rsvp: number): number {
	return Math.round((rsvp / readingWpm - 1) * 100);
}

export function minutesFor(words: number, wpm: number): number {
	return wpm > 0 ? words / wpm : 0;
}
