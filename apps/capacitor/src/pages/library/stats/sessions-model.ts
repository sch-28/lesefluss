import {
	isMeasurableSitting,
	isSkimmedSitting,
	type ReadingMode,
	skimCutoffWpm,
	wpmFrom,
} from "@lesefluss/core";
import type { Book, ReadingSession } from "../../../services/db/schema";
import { MIN_DURATION_MS } from "../../../services/reading-sessions/rules";
import {
	formatDayKey,
	formatDuration,
	localDateKey,
	previousLocalDayStart,
	startOfLocalDay,
} from "../../../utils/date-utils";

export type ModeFilter = ReadingMode | "all";

export interface SessionTotals {
	count: number;
	totalMs: number;
	/** Over the sittings that measure the reader's own speed, skims left out; null when none do. */
	wpm: number | null;
}

export interface SessionDay {
	key: string;
	label: string;
	totalMs: number;
	sessions: ReadingSession[];
}

export function filterSessions(
	rows: readonly ReadingSession[],
	filter: { bookId?: string; mode: ModeFilter; hidden: ReadonlySet<string> },
): ReadingSession[] {
	return rows.filter(
		(row) =>
			row.durationMs >= MIN_DURATION_MS &&
			!filter.hidden.has(row.id) &&
			(filter.bookId === undefined || row.bookId === filter.bookId) &&
			(filter.mode === "all" || row.mode === filter.mode),
	);
}

/** `skimCutoff` comes from every sitting the reader has, so a filter can't move what counts as a skim. */
export function totalsOf(
	rows: readonly ReadingSession[],
	skimCutoff: number = skimCutoffWpm(rows),
): SessionTotals {
	let totalMs = 0;
	let measuredMs = 0;
	let measuredWords = 0;
	for (const row of rows) {
		totalMs += row.durationMs;
		if (isMeasurableSitting(row) && !isSkimmedSitting(row, skimCutoff)) {
			measuredMs += row.durationMs;
			measuredWords += row.wordsRead;
		}
	}
	return { count: rows.length, totalMs, wpm: wpmFrom(measuredWords, measuredMs) };
}

/** The book filter's choices: All books first (value ""), then each book with sessions by title. */
export function bookFilterOptions(
	rows: readonly ReadingSession[],
	books: ReadonlyMap<string, Book>,
): { value: string; label: string; count: number }[] {
	const counts = new Map<string, number>();
	for (const row of rows) counts.set(row.bookId, (counts.get(row.bookId) ?? 0) + 1);
	const options = [...counts]
		.map(([id, count]) => ({ value: id, label: books.get(id)?.title ?? "Unknown book", count }))
		.sort((a, b) => a.label.localeCompare(b.label));
	return [{ value: "", label: "All books", count: rows.length }, ...options];
}

export function dayLabel(key: string, now: number): string {
	const today = startOfLocalDay(now);
	if (key === localDateKey(today)) return "Today";
	if (key === localDateKey(previousLocalDayStart(today))) return "Yesterday";
	return formatDayKey(key, now);
}

/** Rows arrive newest first, so days come out in that order too. */
export function groupByDay(rows: readonly ReadingSession[], now: number): SessionDay[] {
	const days: SessionDay[] = [];
	for (const row of rows) {
		const key = localDateKey(row.startedAt);
		let day = days.at(-1);
		if (day?.key !== key) {
			day = { key, label: dayLabel(key, now), totalMs: 0, sessions: [] };
			days.push(day);
		}
		day.totalMs += row.durationMs;
		day.sessions.push(row);
	}
	return days;
}

/** The first `limit` sessions across the days; each day keeps its whole total. */
export function takeSessions(days: readonly SessionDay[], limit: number): SessionDay[] {
	const out: SessionDay[] = [];
	let left = limit;
	for (const day of days) {
		if (left <= 0) break;
		out.push(day.sessions.length <= left ? day : { ...day, sessions: day.sessions.slice(0, left) });
		left -= day.sessions.length;
	}
	return out;
}

/** From this many sessions a delete asks first; below it, it lands at once with an undo. */
export const CONFIRM_DELETE_FROM = 5;

export function deletedToastText(count: number, mayChangeStreak: boolean): string {
	const noun = count === 1 ? "session" : "sessions";
	return `${count} ${noun} deleted${mayChangeStreak ? " · Streak may change" : ""}`;
}

/** `bookTitle` when every doomed session is of that one book. */
export function deleteConfirmCopy(
	doomed: readonly ReadingSession[],
	bookTitle: string | null,
	mayChangeStreak: boolean,
): { title: string; description: string; confirmLabel: string } {
	const count = doomed.length;
	const noun = count === 1 ? "session" : "sessions";
	const { totalMs } = totalsOf(doomed);
	const recalculated = bookTitle ? `${bookTitle}'s speed, time` : "Speed, time";
	const kept = bookTitle
		? "The book, your position and highlights stay."
		: "The books, your positions and highlights stay.";
	return {
		title: bookTitle ? `Delete ${count} ${noun} of ${bookTitle}?` : `Delete ${count} ${noun}?`,
		description: [
			`${formatDuration(totalMs)} of reading is removed here and on your other devices after sync. ${recalculated} and the totals on Overview recalculate.${mayChangeStreak ? " Streak may change." : ""}`,
			kept,
		].join("\n"),
		confirmLabel: `Delete ${count}`,
	};
}
