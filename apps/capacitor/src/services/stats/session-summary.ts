import {
	isMeasurableSitting,
	type MeasuredReadingMode,
	rsvpTimeSavedMs,
	type SpeedModel,
	wpmFrom,
} from "@lesefluss/core";
import type { SessionRow } from "../reading-sessions/rules";
import { modeAverage } from "./speed-tab";

export type SummaryStats = {
	isRsvp: boolean;
	activeMs: number;
	words: number;
	wpm: number | null;
	/** This sitting against the same mode's average; null without one to compare with. */
	deltaWpm: number | null;
	/** Positions in percent of the book; null when its length is unknown. */
	fromPercent: number | null;
	toPercent: number | null;
	rsvp: { savedMs: number; rsvpMs: number; baselineMs: number; baselineWpm: number } | null;
};

function dominantMode(sittings: SessionRow[]): MeasuredReadingMode | null {
	const byMode = new Map<MeasuredReadingMode, number>();
	for (const s of sittings) {
		if (s.mode === "listen") continue;
		byMode.set(s.mode, (byMode.get(s.mode) ?? 0) + s.durationMs);
	}
	let best: MeasuredReadingMode | null = null;
	for (const [mode, ms] of byMode) if (best === null || ms > (byMode.get(best) ?? 0)) best = mode;
	return best;
}

function speedOf(sittings: SessionRow[], isRsvp: boolean): { words: number; ms: number } {
	let words = 0;
	let ms = 0;
	for (const s of sittings) {
		if (!isMeasurableSitting(s) || (s.mode === "rsvp") !== isRsvp) continue;
		words += s.wordsRead;
		ms += s.durationMs;
	}
	return { words, ms };
}

function percentOf(word: number, wordCount: number): number | null {
	return wordCount > 0 ? Math.min(100, Math.max(0, (word / wordCount) * 100)) : null;
}

/** `sittings` sorted by start, as the summary store hands them over. */
export function summarize(
	sittings: SessionRow[],
	wordCount: number,
	model: SpeedModel | undefined,
): SummaryStats {
	const mode = dominantMode(sittings);
	const isRsvp = mode === "rsvp";
	const own = speedOf(sittings, isRsvp);
	const wpm = wpmFrom(own.words, own.ms);
	const average = model && mode ? modeAverage(model, mode) : null;
	const first = sittings[0];
	const last = sittings[sittings.length - 1];

	let rsvp: SummaryStats["rsvp"] = null;
	if (isRsvp && wpm !== null && model && model.reading.source !== "default") {
		const baselineWpm = model.reading.wpm;
		const savedMs = rsvpTimeSavedMs(own.words, baselineWpm, wpm);
		if (savedMs > 0) {
			rsvp = { savedMs, rsvpMs: own.ms, baselineMs: own.ms + savedMs, baselineWpm };
		}
	}

	return {
		isRsvp,
		activeMs: sittings.reduce((sum, s) => sum + s.durationMs, 0),
		words: sittings.reduce((sum, s) => sum + s.wordsRead, 0),
		wpm,
		deltaWpm: wpm !== null && average !== null ? wpm - average : null,
		fromPercent: first ? percentOf(first.startWord, wordCount) : null,
		toPercent: last ? percentOf(last.endWord, wordCount) : null,
		rsvp,
	};
}

/** Today's minutes before this sitting, and the total with it. */
export function todayMinutes(
	todayMs: number,
	sittingMs: number,
): { earlier: number; total: number } {
	// The sitting's last write may not have landed in today's totals yet.
	const total = Math.max(todayMs, sittingMs);
	// Whole minutes down, as Stats and Sessions show them, so the same day reads the same.
	return { earlier: Math.floor((total - sittingMs) / 60_000), total: Math.floor(total / 60_000) };
}
