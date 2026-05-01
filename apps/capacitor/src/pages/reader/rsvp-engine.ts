/**
 * Pure utilities for the RSVP reader: word navigation, context slicing,
 * and token cleanup. No React, no DOM, no side effects.
 */

import type { WordEntry } from "@lesefluss/core";

/** How many surrounding words to show on each side of the focal word when paused. */
export const CONTEXT_PEEK_WORDS = 50;

/** Strip everything except letters, apostrophes, and hyphens. Preserves casing. */
export function stripPunct(raw: string): string {
	return raw.replace(/[^a-zA-Z'-]/g, "");
}

/** Strip punctuation and lowercase for dictionary lookup. */
export function cleanWord(raw: string): string {
	return stripPunct(raw).toLowerCase();
}

/**
 * Find the start index of the "current" sentence, walking back one sentence
 * on repeat presses (idempotent pressing keeps stepping backward).
 */
export function sentenceStartIndex(words: WordEntry[], idx: number): number {
	let i = Math.max(0, idx - 1);
	while (i > 0) {
		if (/[.!?]$/.test(words[i - 1].word)) break;
		i--;
	}
	return i;
}

/** Start index of the next sentence (word after the next terminator). */
export function nextSentenceIndex(words: WordEntry[], idx: number): number {
	for (let i = idx; i < words.length - 1; i++) {
		if (/[.!?]$/.test(words[i].word)) return i + 1;
	}
	return words.length - 1;
}

export interface ContextWord {
	word: string;
	idx: number;
	breakBefore?: boolean;
}

/** Slice prev/next context windows around the focal word. */
export function sliceContext(
	words: WordEntry[],
	focalIdx: number,
): { prev: ContextWord[]; next: ContextWord[] } {
	const prevStart = Math.max(0, focalIdx - CONTEXT_PEEK_WORDS);
	const prev = words.slice(prevStart, focalIdx).map((w, i) => ({
		word: w.word,
		idx: prevStart + i,
		breakBefore: w.breakBefore,
	}));
	const next = words.slice(focalIdx + 1, focalIdx + 1 + CONTEXT_PEEK_WORDS).map((w, i) => ({
		word: w.word,
		idx: focalIdx + 1 + i,
		breakBefore: w.breakBefore,
	}));
	return { prev, next };
}
