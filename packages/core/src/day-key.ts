/**
 * `YYYY-MM-DD` calendar-day keys. Arithmetic runs on whole days since the epoch
 * in UTC, so no time zone or DST is involved.
 */
const MS_PER_DAY = 86_400_000;
const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Days since the epoch, or null for anything but a real calendar date with a four-digit year. */
export function dayNumberOf(key: string): number | null {
	const match = DAY_KEY.exec(key);
	if (!match) return null;
	const day = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / MS_PER_DAY;
	return dayKeyOf(day) === key ? day : null;
}

export function dayKeyOf(dayNumber: number): string {
	return new Date(dayNumber * MS_PER_DAY).toISOString().slice(0, 10);
}

export function isDayKey(key: string): boolean {
	return dayNumberOf(key) !== null;
}

/** `dayNumberOf` for keys already validated on write or sync: throws on anything else. */
export function requireDayNumber(key: string): number {
	const day = dayNumberOf(key);
	if (day === null) throw new Error(`invalid day key: ${key}`);
	return day;
}

export function addDays(key: string, days: number): string {
	return dayKeyOf(requireDayNumber(key) + days);
}

/** Days from `from` through `to`, both included. */
export function inclusiveDays(from: string, to: string): number {
	return requireDayNumber(to) - requireDayNumber(from) + 1;
}
