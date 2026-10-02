/**
 * Month grid for the streak calendar.
 *
 * A month is ~35 cells, which stays legible at phone width and lets the reader
 * page through history instead of seeing one fixed window.
 */
import { localDateKey } from "../../utils/date-utils";

const MINUTE_MS = 60_000;

export interface DailyReading {
	/** Active milliseconds per local day. */
	msByDay: Map<string, number>;
	/** Days that count toward the streak. A late-night sitting credits the
	 *  evening before too, so this can hold a day with no time of its own. */
	readDays: ReadonlySet<string>;
}

export const NO_READING: DailyReading = { msByDay: new Map(), readDays: new Set() };

/**
 * Intensity steps, in milliseconds read that day. Chosen from real per-day
 * totals (median 18 min, p75 31, p90 76), which these split roughly 43/40/17 so
 * a heavy day still stands out.
 */
const INTENSITY_STEPS_MS = [15 * MINUTE_MS, 45 * MINUTE_MS] as const;

/** Days per week, Monday first. */
const WEEK_LENGTH = 7;

export interface CalendarDay {
	dateKey: string;
	dayStart: number;
	durationMs: number;
	/** False for the leading and trailing days that pad the grid to whole weeks. */
	isInMonth: boolean;
	/** 0 = not read, 1..3 = how much. */
	intensity: 0 | 1 | 2 | 3;
	/** Not read, but a streak freeze kept the streak alive across it. */
	isFrozen: boolean;
	/** The day before this one is also part of a streak, so a connector runs left. */
	linksBefore: boolean;
	/** The day after this one is also part of a streak. */
	linksAfter: boolean;
}

function intensityOf(durationMs: number, isRead: boolean): CalendarDay["intensity"] {
	if (!isRead) return 0;
	if (durationMs <= INTENSITY_STEPS_MS[0]) return 1;
	if (durationMs <= INTENSITY_STEPS_MS[1]) return 2;
	return 3;
}

/**
 * The weeks covering `monthAnchor`'s month, padded to whole Monday-first weeks.
 *
 * Connector flags look at the true adjacent calendar day, including days
 * outside the grid, so a streak that began last month still joins the first
 * row rather than appearing to start on the 1st.
 */
export function buildMonthGrid(
	daily: DailyReading,
	monthAnchor: number,
	frozenDays: ReadonlySet<string> = new Set(),
): CalendarDay[] {
	const anchor = new Date(monthAnchor);
	const year = anchor.getFullYear();
	const month = anchor.getMonth();

	const firstOfMonth = new Date(year, month, 1);
	// getDay() is Sunday-first; shift so Monday is 0.
	const leadingPad = (firstOfMonth.getDay() + 6) % 7;
	const daysInMonth = new Date(year, month + 1, 0).getDate();
	const cellCount = Math.ceil((leadingPad + daysInMonth) / WEEK_LENGTH) * WEEK_LENGTH;

	return buildDays(daily, frozenDays, year, month, 1 - leadingPad, cellCount, month);
}

/** The Monday-first week containing `todayMs`. Every cell counts as in-month:
 *  the strip has no padding days to de-emphasise. */
export function buildWeekStrip(
	daily: DailyReading,
	todayMs: number,
	frozenDays: ReadonlySet<string> = new Set(),
): CalendarDay[] {
	const today = new Date(todayMs);
	const weekdayIndex = (today.getDay() + 6) % 7;
	return buildDays(
		daily,
		frozenDays,
		today.getFullYear(),
		today.getMonth(),
		today.getDate() - weekdayIndex,
		WEEK_LENGTH,
		null,
	);
}

/** `inMonth` of null marks every cell as in-month. */
function buildDays(
	daily: DailyReading,
	frozenDays: ReadonlySet<string>,
	year: number,
	month: number,
	startDay: number,
	cellCount: number,
	inMonth: number | null,
): CalendarDay[] {
	// Built through the Date constructor rather than by adding milliseconds so
	// a DST transition inside the range cannot shift a cell onto the wrong day.
	const dayAt = (offset: number) => {
		const date = new Date(year, month, startDay + offset);
		const key = localDateKey(date.getTime());
		const ms = daily.msByDay.get(key) ?? 0;
		const isRead = daily.readDays.has(key);
		const isFrozen = frozenDays.has(key);
		return { date, key, ms, isRead, isFrozen, isInStreak: isRead || isFrozen };
	};

	const days: CalendarDay[] = [];
	for (let i = 0; i < cellCount; i++) {
		const { date, key, ms, isRead, isFrozen, isInStreak } = dayAt(i);
		days.push({
			dateKey: key,
			dayStart: date.getTime(),
			durationMs: ms,
			isInMonth: inMonth === null || date.getMonth() === inMonth,
			intensity: intensityOf(ms, isRead),
			isFrozen,
			linksBefore: isInStreak && dayAt(i - 1).isInStreak,
			linksAfter: isInStreak && dayAt(i + 1).isInStreak,
		});
	}
	return days;
}

/** Month containing `epochMs`, stepped by `delta` months. Used by the pager. */
export function shiftMonth(epochMs: number, delta: number): number {
	const date = new Date(epochMs);
	return new Date(date.getFullYear(), date.getMonth() + delta, 1).getTime();
}
