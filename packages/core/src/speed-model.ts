import type { MeasuredReadingMode, ReadingMode } from "./reading-credit";
import { type SkimCutoffs, skimCutoffs, speedSittings } from "./reading-rates";

/**
 * The one speed model every surface reads: reading speed (scroll + page), RSVP
 * speed, and the pace time estimates use. App and server call the same function
 * on the same rows, so two surfaces can't show two numbers for one reader.
 */

export const SPEED_WINDOWS = ["recent", "30d", "all"] as const;

export type SpeedWindow = (typeof SPEED_WINDOWS)[number];

/** `recent` keeps the newest sittings until they add up to this much reading. A
 *  sliding date range would leave a reader back from a two-week break with no speed. */
export const RECENT_WINDOW_ACTIVE_MS = 10 * 60 * 60_000;

export const THIRTY_DAYS_MS = 30 * 24 * 60 * 60_000;

/** Below this much reading, a measured figure is noise: two minutes of reading
 *  must not set the speed. */
export const MIN_MODEL_ACTIVE_MS = 10 * 60_000;

/** A book's own speed replaces the global pace for its estimates from here on. */
export const BOOK_SPEED_MIN_ACTIVE_MS = 30 * 60_000;

/** The last fallback when nothing is measured and no speed test exists. */
export const AVERAGE_READER_WPM = 225;

/** RSVP delivered ÷ dial before this reader has RSVP history. The engine spends
 *  time on punctuation pauses and the acceleration ramp; see task-46.3. */
export const DEFAULT_RSVP_DELIVERED_RATIO = 0.65;

export interface SpeedRow {
	/** Absent rows still count toward the global speeds, just not toward a book. */
	bookId?: string | null;
	mode: ReadingMode;
	startedAt: number;
	durationMs: number;
	wordsRead: number;
	/** The RSVP dial on rsvp rows; ignored elsewhere. */
	wpmAvg?: number | null;
}

export type SpeedSource = "measured" | "test" | "default";

/** `book` when a book's own speed is used for its estimates. */
export interface Pace {
	wpm: number;
	source: SpeedSource | "book";
}

export interface ModeSpeed {
	wpm: number;
	words: number;
	activeMs: number;
}

export interface BookSpeed extends ModeSpeed {
	/** The mode with the most words on this book. */
	mode: MeasuredReadingMode;
}

export interface SpeedModel {
	window: SpeedWindow;
	reading: {
		wpm: number;
		source: SpeedSource;
		scroll: ModeSpeed | null;
		page: ModeSpeed | null;
		words: number;
		activeMs: number;
	};
	rsvp:
		| (ModeSpeed & {
				/** Words-weighted dial over the rows that recorded one. */
				dialWpm: number | null;
				deliveredRatio: number | null;
		  })
		| null;
	pace: { wpm: number; source: SpeedSource };
	modesUsed: { reading: boolean; rsvp: boolean };
	/** Measurable sittings in the window. */
	sittings: number;
	/** Every book's own speed over all time: a book's history doesn't leave the window. */
	books: Record<string, BookSpeed>;
}

export interface SpeedTest {
	wpm: number;
	takenAt: number;
}

export interface SpeedModelOptions {
	window?: SpeedWindow;
	now: number;
	speedTest?: SpeedTest | null;
}

/** Words per active minute, rounded, never 0; null when there's no time to divide by. */
export function wpmFrom(words: number, activeMs: number): number | null {
	if (activeMs <= 0 || words <= 0) return null;
	return Math.max(1, Math.round(words / (activeMs / 60_000)));
}

type Measurable<T extends SpeedRow> = T & { mode: MeasuredReadingMode };

function selectWindow<T extends SpeedRow>(
	rows: Measurable<T>[],
	window: SpeedWindow,
	now: number,
): Measurable<T>[] {
	if (window === "all") return rows;
	if (window === "30d") return rows.filter((r) => r.startedAt >= now - THIRTY_DAYS_MS);
	const newestFirst = [...rows].sort((a, b) => b.startedAt - a.startedAt);
	const picked: Measurable<T>[] = [];
	let activeMs = 0;
	for (const r of newestFirst) {
		if (activeMs >= RECENT_WINDOW_ACTIVE_MS) break;
		picked.push(r);
		activeMs += r.durationMs;
	}
	return picked;
}

function modeSpeedOf(words: number, activeMs: number): ModeSpeed | null {
	const wpm = wpmFrom(words, activeMs);
	return wpm === null ? null : { wpm, words, activeMs };
}

/** Speed over these rows' scroll and page reading, or all of it with `withRsvp`;
 *  null under the minimum reading time. */
function measuredWpm(rows: readonly Measurable<SpeedRow>[], withRsvp: boolean): number | null {
	let words = 0;
	let activeMs = 0;
	for (const r of rows) {
		if (r.mode === "rsvp" && !withRsvp) continue;
		words += r.wordsRead;
		activeMs += r.durationMs;
	}
	return activeMs >= MIN_MODEL_ACTIVE_MS ? wpmFrom(words, activeMs) : null;
}

/** A window too thin to measure borrows every measured sitting before
 *  falling back: a reader with hours of history keeps their own speed. */
function measuredOrFallback(
	inWindow: readonly Measurable<SpeedRow>[],
	all: readonly Measurable<SpeedRow>[],
	withRsvp: boolean,
	speedTest: SpeedTest | null | undefined,
): { wpm: number; source: SpeedSource } {
	const wpm = measuredWpm(inWindow, withRsvp) ?? measuredWpm(all, withRsvp);
	return wpm === null ? fallback(speedTest) : { wpm, source: "measured" };
}

function fallback(speedTest: SpeedTest | null | undefined): { wpm: number; source: SpeedSource } {
	return speedTest && speedTest.wpm > 0
		? { wpm: Math.round(speedTest.wpm), source: "test" }
		: { wpm: AVERAGE_READER_WPM, source: "default" };
}

/** Each book's own speed from its measurable, unskimmed sittings, over every row given. */
export function bookSpeeds(
	rows: readonly SpeedRow[],
	cutoffs: SkimCutoffs = skimCutoffs(rows),
): Record<string, BookSpeed> {
	const totals = new Map<
		string,
		{ words: number; activeMs: number; byMode: Map<MeasuredReadingMode, number> }
	>();
	for (const r of speedSittings(rows, cutoffs)) {
		if (!r.bookId) continue;
		const t = totals.get(r.bookId) ?? { words: 0, activeMs: 0, byMode: new Map() };
		t.words += r.wordsRead;
		t.activeMs += r.durationMs;
		t.byMode.set(r.mode, (t.byMode.get(r.mode) ?? 0) + r.wordsRead);
		totals.set(r.bookId, t);
	}
	const books: Record<string, BookSpeed> = {};
	for (const [bookId, t] of totals) {
		const wpm = wpmFrom(t.words, t.activeMs);
		if (wpm === null) continue;
		let mode: MeasuredReadingMode = "scroll";
		let modeWords = -1;
		for (const [m, w] of t.byMode) {
			if (w > modeWords) {
				mode = m;
				modeWords = w;
			}
		}
		books[bookId] = { wpm, words: t.words, activeMs: t.activeMs, mode };
	}
	return books;
}

/** The speed sittings a window holds, so a chart over them matches the model's numbers. */
export function speedWindowRows<T extends SpeedRow>(
	rows: readonly T[],
	window: SpeedWindow,
	now: number,
): (T & { mode: MeasuredReadingMode })[] {
	return selectWindow(speedSittings(rows), window, now);
}

export function computeSpeedModel(rows: readonly SpeedRow[], opts: SpeedModelOptions): SpeedModel {
	const window = opts.window ?? "recent";
	const measurable = speedSittings(rows);
	const inWindow = selectWindow(measurable, window, opts.now);

	const sums = {
		scroll: { words: 0, activeMs: 0 },
		page: { words: 0, activeMs: 0 },
		rsvp: { words: 0, activeMs: 0 },
	};
	// The ratio's two halves come from the same rows: a dial-less RSVP sitting
	// can't count as delivered while being left out of the dial.
	let dialWords = 0;
	let dialWordsWpm = 0;
	let dialActiveMs = 0;
	for (const r of inWindow) {
		sums[r.mode].words += r.wordsRead;
		sums[r.mode].activeMs += r.durationMs;
		if (r.mode === "rsvp" && r.wpmAvg != null && r.wpmAvg > 0) {
			dialWords += r.wordsRead;
			dialWordsWpm += r.wpmAvg * r.wordsRead;
			dialActiveMs += r.durationMs;
		}
	}

	const readingWords = sums.scroll.words + sums.page.words;
	const readingActiveMs = sums.scroll.activeMs + sums.page.activeMs;
	const reading = measuredOrFallback(inWindow, measurable, false, opts.speedTest);

	const rsvpSpeed = modeSpeedOf(sums.rsvp.words, sums.rsvp.activeMs);
	const dialWpm = dialWords > 0 ? Math.round(dialWordsWpm / dialWords) : null;
	const deliveredRatio =
		dialWords > 0 && dialActiveMs > 0
			? dialWords / (dialActiveMs / 60_000) / (dialWordsWpm / dialWords)
			: null;

	return {
		window,
		reading: {
			...reading,
			scroll: modeSpeedOf(sums.scroll.words, sums.scroll.activeMs),
			page: modeSpeedOf(sums.page.words, sums.page.activeMs),
			words: readingWords,
			activeMs: readingActiveMs,
		},
		rsvp: rsvpSpeed ? { ...rsvpSpeed, dialWpm, deliveredRatio } : null,
		pace: measuredOrFallback(inWindow, measurable, true, opts.speedTest),
		modesUsed: { reading: readingWords > 0, rsvp: sums.rsvp.words > 0 },
		sittings: inWindow.length,
		books: bookSpeeds(rows),
	};
}

/** The pace for one book's estimates: its own speed once read long enough, else the global pace. */
export function bookPace(model: SpeedModel | undefined, bookId: string | null | undefined): Pace {
	const book = bookId ? model?.books[bookId] : undefined;
	if (book && book.activeMs >= BOOK_SPEED_MIN_ACTIVE_MS) return { wpm: book.wpm, source: "book" };
	return model?.pace ?? { wpm: AVERAGE_READER_WPM, source: "default" };
}

/** Whether a pace is this reader's own rather than a stand-in. */
export function isMeasuredPace(pace: Pace): boolean {
	return pace.source === "measured" || pace.source === "book";
}

/**
 * The speed of the mode being read right now, for the reader's own estimates.
 * RSVP scales the dial, which can change mid-book, by what this reader's RSVP
 * sittings delivered; scroll and page use their own measured speed once there
 * is enough of it, else the reading speed.
 */
export function modeSpeed(
	model: SpeedModel | undefined,
	mode: MeasuredReadingMode,
	dialWpm: number,
): number {
	if (mode === "rsvp") {
		const rsvp = model?.rsvp;
		const ratio =
			rsvp && rsvp.activeMs >= MIN_MODEL_ACTIVE_MS && rsvp.deliveredRatio !== null
				? rsvp.deliveredRatio
				: DEFAULT_RSVP_DELIVERED_RATIO;
		return Math.max(1, Math.round(dialWpm * ratio));
	}
	const own = model?.reading[mode];
	if (own && own.activeMs >= MIN_MODEL_ACTIVE_MS) return own.wpm;
	return model?.reading.wpm ?? AVERAGE_READER_WPM;
}

/**
 * The pace a book's time left is estimated at, so the reader footer and book
 * detail agree: the book's own pace, except RSVP, whose time follows the dial.
 */
export function timeLeftWpm(
	model: SpeedModel | undefined,
	bookId: string | null | undefined,
	mode: MeasuredReadingMode,
	dialWpm: number,
): number {
	return mode === "rsvp" ? modeSpeed(model, "rsvp", dialWpm) : bookPace(model, bookId).wpm;
}

export function estimateMinutes(words: number, wpm: number): number {
	return Math.max(0, words) / Math.max(1, wpm);
}

/** Time RSVP saved over reading the same words normally; 0 when RSVP was slower
 *  or there's no natural baseline to compare against. */
export function rsvpTimeSavedMs(rsvpWords: number, readingWpm: number, rsvpWpm: number): number {
	if (rsvpWords <= 0 || readingWpm <= 0 || rsvpWpm <= readingWpm) return 0;
	return rsvpWords * (1 / readingWpm - 1 / rsvpWpm) * 60_000;
}
