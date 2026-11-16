import {
	BOOK_SPEED_MIN_ACTIVE_MS,
	bookSpeeds,
	type MeasuredReadingMode,
	type ReadingMode,
	rsvpTimeSavedMs,
	type SpeedModel,
	speedSittings,
	wpmFrom,
} from "@lesefluss/core";
import { fastestBook } from "./records";

export type SpeedView = "reading" | "rsvp";

/** A sitting shorter than this can't hold a speed record: a fast minute is noise. */
export const RECORD_SITTING_MIN_MS = 5 * 60_000;

export interface SpeedTabSession {
	bookId: string;
	mode: ReadingMode;
	startedAt: number;
	durationMs: number;
	wordsRead: number;
	wpmAvg: number | null;
}

export interface SpeedBookRow {
	bookId: string;
	title: string;
	author: string | null;
	coverImage: string | null;
	mode: MeasuredReadingMode;
	wpm: number;
	activeMs: number;
	/** Words-weighted RSVP dial over this book's RSVP sittings, null when none recorded one. */
	dialWpm: number | null;
	lastAt: number;
}

export interface SittingRecord {
	wpm: number;
	durationMs: number;
	at: number;
	title: string;
}

export interface SpeedRecords {
	fastestSitting: SittingRecord | null;
	fastestBook: { wpm: number; title: string } | null;
	bestRsvpSitting: SittingRecord | null;
	longestRsvpRun: SittingRecord | null;
}

export interface SpeedTabData {
	books: SpeedBookRow[];
	records: SpeedRecords;
}

export function speedViews(model: SpeedModel): SpeedView[] {
	const views: SpeedView[] = [];
	if (model.modesUsed.reading || !model.modesUsed.rsvp) views.push("reading");
	if (model.rsvp) views.push("rsvp");
	return views;
}

/** Time RSVP saved over reading the same words at the reader's own speed; 0 hides it. */
export function timeSavedMs(model: SpeedModel): number {
	if (!model.rsvp || model.reading.source === "default") return 0;
	return rsvpTimeSavedMs(model.rsvp.words, model.reading.wpm, model.rsvp.wpm);
}

export const SPEED_DELTA_SPAN_MS = 28 * 24 * 60 * 60_000;

/**
 * The headline speed now against the same window's speed four weeks earlier, so the
 * delta compares one measure with itself. Null unless both are measured: a speed
 * test or the average reader can't move.
 */
export function speedDelta(
	current: SpeedModel,
	earlier: SpeedModel | undefined,
	view: SpeedView,
): number | null {
	if (!earlier || !isMeasured(current, view) || !isMeasured(earlier, view)) return null;
	return viewWpm(current, view) - viewWpm(earlier, view);
}

function isMeasured(model: SpeedModel, view: SpeedView): boolean {
	return view === "rsvp" ? model.rsvp !== null : model.reading.source === "measured";
}

export function viewWpm(model: SpeedModel, view: SpeedView): number {
	return view === "rsvp" ? (model.rsvp?.wpm ?? 0) : model.reading.wpm;
}

export function deltaLabel(wpm: number): string {
	const signed = wpm > 0 ? `+${wpm}` : wpm < 0 ? `−${Math.abs(wpm)}` : "±0";
	return `${signed} in 4 weeks`;
}

/** The mode average a book is compared with, so an RSVP book isn't measured against scrolling. */
export function modeAverage(model: SpeedModel, mode: MeasuredReadingMode): number | null {
	if (mode === "rsvp") return model.rsvp?.wpm ?? null;
	const own = model.reading[mode];
	if (own) return own.wpm;
	return model.reading.source === "default" ? null : model.reading.wpm;
}

export function percentVsAverage(wpm: number, average: number | null): number | null {
	if (average === null || average <= 0) return null;
	return Math.round(((wpm - average) / average) * 100);
}

export type BookSort = "wpm" | "delta" | "recent";

export function sortBookRows(
	rows: readonly SpeedBookRow[],
	sort: BookSort,
	model: SpeedModel,
): SpeedBookRow[] {
	const key = (row: SpeedBookRow): number => {
		if (sort === "wpm") return row.wpm;
		if (sort === "recent") return row.lastAt;
		return percentVsAverage(row.wpm, modeAverage(model, row.mode)) ?? Number.NEGATIVE_INFINITY;
	};
	return [...rows].sort((a, b) => key(b) - key(a));
}

/**
 * The Speed tab's per-book rows and records, from every sitting. A book's speed
 * and mode are the speed model's own (`bookSpeeds`), shown once the book has the
 * reading time the model asks for.
 */
export function buildSpeedTabData(
	sessions: readonly SpeedTabSession[],
	books: ReadonlyMap<string, { title: string; author?: string | null; coverImage: string | null }>,
): SpeedTabData {
	const extras = new Map<string, { dialWords: number; dialWeighted: number; lastAt: number }>();
	const records: SpeedRecords = {
		fastestSitting: null,
		fastestBook: null,
		bestRsvpSitting: null,
		longestRsvpRun: null,
	};

	for (const s of speedSittings(sessions)) {
		const book = books.get(s.bookId);
		if (!book) continue;

		const extra = extras.get(s.bookId) ?? { dialWords: 0, dialWeighted: 0, lastAt: 0 };
		if (s.mode === "rsvp" && s.wpmAvg != null && s.wpmAvg > 0) {
			extra.dialWords += s.wordsRead;
			extra.dialWeighted += s.wpmAvg * s.wordsRead;
		}
		extra.lastAt = Math.max(extra.lastAt, s.startedAt);
		extras.set(s.bookId, extra);

		const wpm = wpmFrom(s.wordsRead, s.durationMs);
		if (wpm === null || s.durationMs < RECORD_SITTING_MIN_MS) continue;
		const sitting = { wpm, durationMs: s.durationMs, at: s.startedAt, title: book.title };
		if (s.mode === "rsvp") {
			if (!records.bestRsvpSitting || wpm > records.bestRsvpSitting.wpm) {
				records.bestRsvpSitting = sitting;
			}
			if (!records.longestRsvpRun || s.durationMs > records.longestRsvpRun.durationMs) {
				records.longestRsvpRun = sitting;
			}
		} else if (!records.fastestSitting || wpm > records.fastestSitting.wpm) {
			records.fastestSitting = sitting;
		}
	}

	const speeds = bookSpeeds(sessions);
	records.fastestBook = fastestBook(speeds, (id) => books.get(id)?.title);

	const rows: SpeedBookRow[] = [];
	for (const [bookId, speed] of Object.entries(speeds)) {
		const book = books.get(bookId);
		const extra = extras.get(bookId);
		if (!book || !extra || speed.activeMs < BOOK_SPEED_MIN_ACTIVE_MS) continue;
		rows.push({
			bookId,
			title: book.title,
			author: book.author ?? null,
			coverImage: book.coverImage,
			mode: speed.mode,
			wpm: speed.wpm,
			activeMs: speed.activeMs,
			dialWpm: extra.dialWords > 0 ? Math.round(extra.dialWeighted / extra.dialWords) : null,
			lastAt: extra.lastAt,
		});
	}

	return { books: rows, records };
}
