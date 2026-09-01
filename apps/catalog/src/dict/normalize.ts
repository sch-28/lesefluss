/**
 * The lookup key rule, used at import time and at query time alike.
 *
 * Both callers live in this process, so the write key and the read key cannot
 * drift. The client deliberately does not reproduce this: it sends the word as
 * it appears in the book (punctuation stripped, original case) and lets the
 * server decide what the key is.
 */

/** Curly and modifier apostrophes fold to ASCII so `don’t` matches Wiktionary's `don't`. */
const APOSTROPHES = /[’ʼ]/g;

/**
 * The apostrophe fold on its own, for callers that must keep casing.
 * The ranking tiebreak compares against stored orthography, so it needs the
 * same apostrophe treatment `word_key` got without losing the case that
 * separates German homographs.
 */
export function foldApostrophes(raw: string): string {
	return raw.replace(APOSTROPHES, "'");
}

/** Letters, combining marks, apostrophes and hyphens survive; everything else goes. */
const NON_WORD = /[^\p{L}\p{M}'-]/gu;

/** Longest headword in the English dump is well under this; the cap bounds abuse. */
const MAX_KEY_LENGTH = 128;

export function normalizeWord(raw: string): string {
	return raw
		.normalize("NFC")
		.replace(APOSTROPHES, "'")
		.replace(NON_WORD, "")
		.toLowerCase()
		.slice(0, MAX_KEY_LENGTH);
}
