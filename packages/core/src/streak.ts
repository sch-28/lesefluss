/** A calendar day counts toward a streak once its sessions sum to this much. */
export const MIN_STREAK_MINUTES = 1;

export interface StreakResult {
	current: number;
	longest: number;
}

/** The day before a `YYYY-MM-DD` key. Calendar arithmetic, so no time zone or DST is involved. */
export function previousDayKey(key: string): string {
	const [y, m, d] = key.split("-").map(Number);
	const prev = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, (d ?? 1) - 1));
	return prev.toISOString().slice(0, 10);
}

/**
 * Current and longest run of consecutive reading days. `minutesByDay` is keyed
 * by `YYYY-MM-DD` in the reader's own time zone; a streak still counts as
 * current when today has no reading yet but yesterday had.
 */
export function streakFromDays(minutesByDay: Map<string, number>, todayKey: string): StreakResult {
	// The threshold applies to the day's total, not to each sitting.
	const days = new Set(
		[...minutesByDay].filter(([, minutes]) => minutes >= MIN_STREAK_MINUTES).map(([key]) => key),
	);

	let current = 0;
	let cursor = days.has(todayKey) ? todayKey : previousDayKey(todayKey);
	while (days.has(cursor)) {
		current++;
		cursor = previousDayKey(cursor);
	}

	let longest = 0;
	let run = 0;
	let expected: string | null = null;
	for (const key of [...days].sort().reverse()) {
		run = key === expected ? run + 1 : 1;
		if (run > longest) longest = run;
		expected = previousDayKey(key);
	}
	return { current, longest: Math.max(longest, current) };
}
