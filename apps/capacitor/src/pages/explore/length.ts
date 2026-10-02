import { estimatePages, formatReadingTime } from "../../utils/reading-time";

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

/**
 * Bounds use the speed rounded to this step: the measured speed shifts a little
 * after every session, and each shift would otherwise be a new search that
 * reloads the list from page one and moves books in and out at the edges.
 */
const BOUNDS_WPM_STEP = 25;

/** Word bounds for a bucket at `wpm`, as the catalog's min_words / max_words. */
export function wordBounds(
	bucket: LengthBucket,
	wpm: number,
): { minWords?: number; maxWords?: number } {
	const { min, max } = RANGES[bucket];
	const pace = Math.max(BOUNDS_WPM_STEP, Math.round(wpm / BOUNDS_WPM_STEP) * BOUNDS_WPM_STEP);
	return {
		minWords: min === undefined ? undefined : Math.round(min * pace),
		maxWords: max === undefined ? undefined : Math.round(max * pace),
	};
}

export type BookLength = {
	wordCount?: number | null;
	/** The count is an estimate; shown with a "~". */
	wordCountEstimated?: boolean;
};

export type LengthLabels = {
	words: number;
	/** "~312 pages · 4h 10m", for list rows and the book page. */
	text: string;
	/** "~4h 10m" for a cover badge; whole hours from 10h on, to fit a phone grid. */
	time: string;
	/** What a screen reader says for `text`: "About 312 pages, 4 hours 10 minutes". */
	spoken: string;
	/** What a screen reader says for `time`: "About 4 hours 10 minutes to read". */
	spokenTime: string;
};

const plural = (n: number, unit: string) =>
	`${n.toLocaleString("en")} ${unit}${n === 1 ? "" : "s"}`;

function spokenDuration(minutes: number): string {
	if (minutes < 1) return "under a minute";
	const total = Math.round(minutes);
	const hours = Math.floor(total / 60);
	const rest = total % 60;
	if (hours === 0) return plural(rest, "minute");
	return rest === 0 ? plural(hours, "hour") : `${plural(hours, "hour")} ${plural(rest, "minute")}`;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const BADGE_WHOLE_HOURS_FROM_MIN = 600;

/**
 * Length the way every Explore surface shows it, with a leading "~" (spoken
 * "About") while estimated. Null when the length is unknown.
 */
export function describeLength(length: BookLength, wpm: number): LengthLabels | null {
	const words = length.wordCount;
	if (!words) return null;
	const pages = estimatePages(words);
	const minutes = words / wpm;
	const approx = length.wordCountEstimated ? "~" : "";
	const about = length.wordCountEstimated ? "About " : "";
	const time =
		minutes >= BADGE_WHOLE_HOURS_FROM_MIN
			? `${Math.round(minutes / 60)}h`
			: formatReadingTime(minutes);
	const duration = spokenDuration(minutes);
	return {
		words,
		text: `${approx}${plural(pages, "page")} · ${formatReadingTime(minutes)}`,
		time: `${approx}${time}`,
		spoken: `${about}${plural(pages, "page")}, ${duration}`,
		spokenTime: capitalize(`${about}${duration} to read`),
	};
}
