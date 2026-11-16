import { BOOK_SERIES_NAME_MAX } from "./sync";

/**
 * Matching key for a book's series hint: two hints that differ only in case,
 * punctuation, spacing or Unicode form land on one series collection.
 * Leading articles are kept ("The Expanse" and "Expanse" stay apart).
 */
export function normalizeSeriesKey(name: string | null | undefined): string | null {
	if (!name) return null;
	const key = name
		.normalize("NFKC")
		.toLowerCase()
		.replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
		.trim()
		.slice(0, BOOK_SERIES_NAME_MAX)
		.trimEnd();
	return key || null;
}

export const SERIES_ID_PREFIX = "series-";

export function isSeriesCollectionId(id: string): boolean {
	return id.startsWith(SERIES_ID_PREFIX);
}

function fnv1a32(text: string, seed: number): number {
	let hash = seed;
	for (let i = 0; i < text.length; i++) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
}

/**
 * Collection id of the series collection for a key. Derived, not random, so
 * two devices that create the same series offline converge on one row, and a
 * tombstone on that id is the user's dismissal of the series.
 */
export function seriesCollectionId(seriesKey: string): string {
	const high = fnv1a32(seriesKey, 0x811c9dc5).toString(16).padStart(8, "0");
	const low = fnv1a32(seriesKey, 0x050c5d1f).toString(16).padStart(8, "0");
	return `${SERIES_ID_PREFIX}${high}${low}`;
}
