import { formatReadingTime } from "../../utils/reading-time";

export const LENGTH_BUCKETS = ["short", "medium", "long", "epic"] as const;
export type LengthBucket = (typeof LENGTH_BUCKETS)[number];

/** Reading time ranges in minutes, at the reader's own speed. */
const RANGES: Record<LengthBucket, { label: string; min?: number; max?: number }> = {
	short: { label: "Under 1 hour", max: 60 },
	medium: { label: "1-3 hours", min: 60, max: 180 },
	long: { label: "3-10 hours", min: 180, max: 600 },
	epic: { label: "Over 10 hours", min: 600 },
};

export function lengthLabel(bucket: LengthBucket): string {
	return RANGES[bucket].label;
}

/** Word bounds for a bucket at `wpm`, as the catalog's min_words / max_words. */
export function wordBounds(
	bucket: LengthBucket,
	wpm: number,
): { minWords?: number; maxWords?: number } {
	const { min, max } = RANGES[bucket];
	return {
		minWords: min === undefined ? undefined : Math.round(min * wpm),
		maxWords: max === undefined ? undefined : Math.round(max * wpm),
	};
}

export function readingTimeLabel(wordCount: number | null | undefined, wpm: number): string | null {
	if (!wordCount) return null;
	return formatReadingTime(wordCount / wpm);
}
