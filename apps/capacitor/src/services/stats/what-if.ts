/**
 * Book detail's time estimates at a speed the reader tries out: time left, the
 * finish date at their daily reading time, and a series' total and remainder.
 */
import { addDays, estimateMinutes, inclusiveDays } from "@lesefluss/core";

export const WHAT_IF_WPM = { min: 100, max: 1000, step: 25 } as const;

const AVERAGE_WINDOW_DAYS = 30;

/** The slider's start: the pace, snapped onto the slider's steps. */
export function whatIfStart(paceWpm: number): number {
	const snapped = Math.round(paceWpm / WHAT_IF_WPM.step) * WHAT_IF_WPM.step;
	return Math.min(WHAT_IF_WPM.max, Math.max(WHAT_IF_WPM.min, snapped));
}

/**
 * Minutes read per calendar day over the last 30 days, days without reading
 * included. Counted from the first reading day in the window, so a reader who
 * started last week is not averaged over three weeks before they began.
 * Null with no reading in the window.
 */
export function averageDailyMinutes(
	msByDay: ReadonlyMap<string, number>,
	today: string,
): number | null {
	const windowStart = addDays(today, -(AVERAGE_WINDOW_DAYS - 1));
	let totalMs = 0;
	let first: string | null = null;
	for (const [day, ms] of msByDay) {
		if (day < windowStart || day > today || ms <= 0) continue;
		totalMs += ms;
		if (first === null || day < first) first = day;
	}
	if (first === null) return null;
	return totalMs / 60_000 / inclusiveDays(first, today);
}

export interface WhatIfEstimate {
	minutesLeft: number;
	/** Null without a daily reading time to project with. */
	finishDay: string | null;
}

/** Time left at `wpm`, and the finish day reading `minutesPerDay` from today on. */
export function whatIfEstimate(
	wordsLeft: number,
	wpm: number,
	minutesPerDay: number | null,
	today: string,
): WhatIfEstimate {
	const minutesLeft = estimateMinutes(wordsLeft, wpm);
	return {
		minutesLeft,
		finishDay:
			minutesPerDay != null && minutesPerDay > 0
				? finishDayAt(minutesLeft, minutesPerDay, today)
				: null,
	};
}

/** The day the last word is read at `minutesPerDay`, reading from today on. */
export function finishDayAt(minutesLeft: number, minutesPerDay: number, today: string): string {
	return addDays(today, Math.max(1, Math.ceil(minutesLeft / Math.max(1e-9, minutesPerDay))) - 1);
}

export interface SeriesChapterLength {
	wordCount: number;
	wordPosition: number;
	finishedAt: number | null;
}

export interface SeriesReadingTime {
	words: number;
	wordsLeft: number;
	/** Chapters without a known length yet (not downloaded), left out of both sums. */
	unknown: number;
}

/** A finished chapter has nothing left, wherever its position stopped. */
export function seriesReadingTime(chapters: readonly SeriesChapterLength[]): SeriesReadingTime {
	let words = 0;
	let wordsLeft = 0;
	let unknown = 0;
	for (const chapter of chapters) {
		if (chapter.wordCount <= 0) {
			unknown++;
			continue;
		}
		words += chapter.wordCount;
		if (chapter.finishedAt === null) {
			wordsLeft += Math.max(0, chapter.wordCount - chapter.wordPosition);
		}
	}
	return { words, wordsLeft, unknown };
}
