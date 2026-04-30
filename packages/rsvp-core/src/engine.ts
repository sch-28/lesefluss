/**
 * RSVP Engine - pure algorithm functions matching the ESP32 reader exactly.
 *
 * No React, no DOM - just word splitting, delay calculation, and ORP.
 * See apps/esp32/src/reader/rsvp.py and apps/esp32/src/config.py.
 */

import { utf8ByteLength } from "./utf8";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface WordEntry {
	word: string;
	byteOffset: number;
	/** True when this word is preceded by a paragraph break (≥2 newlines) in the source. */
	breakBefore?: boolean;
}

export interface RsvpSettings {
	wpm: number;
	delayComma: number;
	delayPeriod: number;
	accelStart: number;
	accelRate: number;
	xOffset: number;
	focalLetterColor: string;
}

// ─── Word index ─────────────────────────────────────────────────────────────

/**
 * Split content into words with their UTF-8 byte offsets.
 * Matches the ESP32's whitespace splitting (space, tab, newline, CR).
 */
export function buildWordIndex(content: string): WordEntry[] {
	const tokens = content.split(/(\s+)/);
	const entries: WordEntry[] = [];
	let byteOffset = 0;
	let pendingBreak = false;

	for (const token of tokens) {
		if (token.length === 0) continue;
		if (/^\s+$/.test(token)) {
			if ((token.match(/\n/g)?.length ?? 0) >= 2) pendingBreak = true;
		} else {
			const entry: WordEntry = { word: token, byteOffset };
			if (pendingBreak && entries.length > 0) entry.breakBefore = true;
			entries.push(entry);
			pendingBreak = false;
		}
		byteOffset += utf8ByteLength(token);
	}

	return entries;
}

// ─── Long-word splitting ────────────────────────────────────────────────────

/** Max characters per displayed RSVP frame before a word is split. */
export const MAX_WORD_LEN = 13;

/**
 * Split a long word into chunks of at most `maxLen` characters for display.
 * Prefers hyphen boundaries (keeps trailing hyphen on each part); falls back
 * to a hard cut with an appended '-' on non-final pieces. Words at or below
 * the threshold are returned as a single-element array.
 *
 * Source of truth for the algorithm. Mirrored in
 * apps/esp32/src/reader/rsvp.py (`_split_long_word`) - keep both in sync.
 */
export function splitLongWord(word: string, maxLen: number = MAX_WORD_LEN): string[] {
	if (word.length <= maxLen) return [word];

	// 1. Greedy merge on hyphen boundaries (the regex keeps the '-' on the
	//    preceding piece, so "blue-dragonfly-shine" → ["blue-", "dragonfly-", "shine"]).
	const parts = word.split(/(?<=-)/);
	const merged: string[] = [];
	let buf = "";
	for (const p of parts) {
		if (buf.length + p.length <= maxLen) {
			buf += p;
		} else {
			if (buf) merged.push(buf);
			buf = p;
		}
	}
	if (buf) merged.push(buf);

	// 2. Hard-cut any merged chunk still over the limit, suffixing '-' on
	//    non-final pieces to signal continuation.
	const out: string[] = [];
	for (const chunk of merged) {
		if (chunk.length <= maxLen) {
			out.push(chunk);
			continue;
		}
		let i = 0;
		while (i < chunk.length) {
			const remaining = chunk.length - i;
			if (remaining <= maxLen) {
				out.push(chunk.slice(i));
				break;
			}
			out.push(`${chunk.slice(i, i + maxLen - 1)}-`);
			i += maxLen - 1;
		}
	}
	return out;
}

// ─── ORP (Optimal Recognition Point) ────────────────────────────────────────

/**
 * Focal letter index for a word. Exact replica of config.get_focal_position().
 *
 *   length 1–2  → 0
 *   length 3–5  → 1
 *   length 6–9  → 2
 *   length 10–13 → 3
 *   length 14+  → 4
 */
export function calcOrpIndex(wordLength: number): number {
	if (wordLength <= 2) return 0;
	if (wordLength <= 5) return 1;
	if (wordLength <= 9) return 2;
	if (wordLength <= 13) return 3;
	return 4;
}

// ─── Delay calculation ──────────────────────────────────────────────────────

/**
 * Calculate the display delay for a word, including punctuation multipliers
 * and acceleration ramp. Exact replica of RsvpReader.get_word_delay().
 *
 * Returns the delay in milliseconds and the updated acceleration value.
 */
export function calcDelay(
	word: string,
	settings: RsvpSettings,
	acceleration: number,
): { delayMs: number; nextAcceleration: number } {
	let base = 60000 / settings.wpm;

	// Punctuation multipliers - first match wins (matches ESP32 order)
	if (word.includes("...") || word.includes("\u2014") || word.includes("--")) {
		base *= settings.delayPeriod;
	} else if (/[.!?]/.test(word)) {
		base *= settings.delayPeriod;
	} else if (/[,;:]/.test(word)) {
		base *= settings.delayComma;
	}

	// Acceleration ramp
	const multiplier = settings.accelStart - acceleration;
	const delayMs = base * multiplier;
	const nextAcceleration = Math.min(acceleration + settings.accelRate, settings.accelStart - 1.0);

	return { delayMs, nextAcceleration };
}

// ─── Position lookup ────────────────────────────────────────────────────────

/**
 * Binary search for the last word whose byteOffset ≤ targetOffset.
 */
export function findWordIndexAtOffset(words: WordEntry[], targetOffset: number): number {
	if (words.length === 0) return 0;
	let lo = 0;
	let hi = words.length - 1;
	while (lo < hi) {
		const mid = Math.ceil((lo + hi) / 2);
		if (words[mid].byteOffset <= targetOffset) {
			lo = mid;
		} else {
			hi = mid - 1;
		}
	}
	return lo;
}
