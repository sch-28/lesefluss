/**
 * Percent of a book read before it counts as finished. Books rarely end at
 * 100%: back matter, acknowledgements and licence text sit past the last of the
 * prose, so a reader who has finished reading often stops short of the end.
 */
export const FINISHED_PERCENT_THRESHOLD = 95;

/** Structural rather than `Book`, so aggregated works (a rolled-up serial) share
 *  the one clamped formula instead of re-deriving it. */
export function readingProgress(work: { wordCount: number; wordPosition: number }): number {
	if (work.wordCount <= 0) return 0;
	return Math.min(100, Math.round((work.wordPosition / work.wordCount) * 100));
}

export function isFinishedPercent(percent: number): boolean {
	return percent >= FINISHED_PERCENT_THRESHOLD;
}

/**
 * Ratings count half-stars, so the column runs 1..10 and 7 means three and a
 * half. An integer rather than a real: SQLite cannot change a column's declared
 * type without rebuilding the table, and halves stored as 0.5 steps would drift
 * through the JSON and Postgres round trip.
 */
export const RATING_STARS = 5;
/** Half-stars per whole star. The rating column counts these. */
export const HALF_STARS_PER_STAR = 2;
export const RATING_MAX = RATING_STARS * HALF_STARS_PER_STAR;

/** Whole and half stars a rating fills, for rendering. */
export function ratingStars(rating: number): number {
	return rating / HALF_STARS_PER_STAR;
}

/** How much of star `star` (1-based) a rating fills: 0 empty, 1 half, 2 full. */
export function starFill(rating: number | null, star: number): 0 | 1 | 2 {
	const filled = (rating ?? 0) - (star - 1) * HALF_STARS_PER_STAR;
	return Math.min(HALF_STARS_PER_STAR, Math.max(0, filled)) as 0 | 1 | 2;
}

/**
 * Rating after tapping star `star` (1-based) when `current` is set.
 *
 * A tap sets that star full; tapping the star that is already full drops it to
 * half; tapping again returns it to full. Clearing is a separate control, so no
 * tap sequence can leave the reader unable to express "one half star".
 */
export function nextRating(current: number | null, star: number): number {
	const full = star * HALF_STARS_PER_STAR;
	return current === full ? full - 1 : full;
}

/**
 * Shelf a book sits on. `dropped` has no derivation: abandoning a book is a
 * decision, not something a reading position can imply.
 */
export const BOOK_STATUSES = ["want", "reading", "finished", "dropped"] as const;

export type BookStatus = (typeof BOOK_STATUSES)[number];

/** One vocabulary for the shelves, so the app and the website cannot drift. */
export const BOOK_STATUS_LABELS: Record<BookStatus, string> = {
	want: "Want to read",
	reading: "Reading",
	finished: "Finished",
	dropped: "Dropped",
};

/** Tags as stored in the `tags` column: a JSON array, tolerant of a malformed
 *  value so one bad row cannot break a library screen. */
export function parseBookTags(raw: string | null): string[] {
	if (!raw) return [];
	try {
		const parsed: unknown = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : [];
	} catch {
		return [];
	}
}

export function serializeBookTags(tags: string[]): string | null {
	return tags.length > 0 ? JSON.stringify(tags) : null;
}

export function isBookStatus(value: unknown): value is BookStatus {
	return typeof value === "string" && (BOOK_STATUSES as readonly string[]).includes(value);
}

/**
 * Shelf a book belongs on, from its own `status` when the reader set one and
 * from reading progress otherwise.
 *
 * A stored status is sticky by design: it survives further reading, so a book
 * marked `dropped` stays dropped even if you later read it to the end. Clearing
 * the column (back to null) is the only way back to the derived answer.
 */
export function bookStatus(book: {
	wordCount: number;
	wordPosition: number;
	status?: string | null;
}): BookStatus {
	if (isBookStatus(book.status)) return book.status;
	const percent = readingProgress(book);
	if (isFinishedPercent(percent)) return "finished";
	return percent > 0 ? "reading" : "want";
}
