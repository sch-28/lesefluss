/**
 * Month grid for the streak calendar.
 *
 * A month is ~35 cells, which stays legible at phone width and lets the reader
 * page through history instead of seeing one fixed window.
 */
import { localDateKey } from "../../utils/date-utils";
import { MIN_STREAK_MINUTES } from "./aggregate";

const MINUTE_MS = 60_000;

/** Below this a day does not count as read, matching the streak scan. */
const MIN_READ_MS = MIN_STREAK_MINUTES * MINUTE_MS;

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
	/** The day before this one was also read, so a streak connector runs left. */
	linksBefore: boolean;
	/** The day after this one was also read. */
	linksAfter: boolean;
}

function intensityOf(durationMs: number): CalendarDay["intensity"] {
	if (durationMs < MIN_READ_MS) return 0;
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
export function buildMonthGrid(msByDay: Map<string, number>, monthAnchor: number): CalendarDay[] {
	const anchor = new Date(monthAnchor);
	const year = anchor.getFullYear();
	const month = anchor.getMonth();

	const firstOfMonth = new Date(year, month, 1);
	// getDay() is Sunday-first; shift so Monday is 0.
	const leadingPad = (firstOfMonth.getDay() + 6) % 7;
	const daysInMonth = new Date(year, month + 1, 0).getDate();
	const cellCount = Math.ceil((leadingPad + daysInMonth) / WEEK_LENGTH) * WEEK_LENGTH;

	return buildDays(msByDay, year, month, 1 - leadingPad, cellCount, month);
}

/** The Monday-first week containing `todayMs`. Every cell counts as in-month:
 *  the strip has no padding days to de-emphasise. */
export function buildWeekStrip(msByDay: Map<string, number>, todayMs: number): CalendarDay[] {
	const today = new Date(todayMs);
	const weekdayIndex = (today.getDay() + 6) % 7;
	return buildDays(
		msByDay,
		today.getFullYear(),
		today.getMonth(),
		today.getDate() - weekdayIndex,
		WEEK_LENGTH,
		null,
	);
}

/** `inMonth` of null marks every cell as in-month. */
function buildDays(
	msByDay: Map<string, number>,
	year: number,
	month: number,
	startDay: number,
	cellCount: number,
	inMonth: number | null,
): CalendarDay[] {
	// Built through the Date constructor rather than by adding milliseconds so
	// a DST transition inside the range cannot shift a cell onto the wrong day.
	const msOn = (offset: number): { date: Date; ms: number } => {
		const date = new Date(year, month, startDay + offset);
		return { date, ms: msByDay.get(localDateKey(date.getTime())) ?? 0 };
	};

	const days: CalendarDay[] = [];
	for (let i = 0; i < cellCount; i++) {
		const { date, ms } = msOn(i);
		const isRead = ms >= MIN_READ_MS;
		days.push({
			dateKey: localDateKey(date.getTime()),
			dayStart: date.getTime(),
			durationMs: ms,
			isInMonth: inMonth === null || date.getMonth() === inMonth,
			intensity: intensityOf(ms),
			linksBefore: isRead && msOn(i - 1).ms >= MIN_READ_MS,
			linksAfter: isRead && msOn(i + 1).ms >= MIN_READ_MS,
		});
	}
	return days;
}

/** Month containing `epochMs`, stepped by `delta` months. Used by the pager. */
export function shiftMonth(epochMs: number, delta: number): number {
	const date = new Date(epochMs);
	return new Date(date.getFullYear(), date.getMonth() + delta, 1).getTime();
}
