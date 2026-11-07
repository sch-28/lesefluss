import { readDaysOf, type SessionTiming } from "./aggregate";

type Row = SessionTiming & { id: string };

/** Reading days the streak loses when `deleteIds` go: days no other session still reads on. */
export function lostReadingDays(deleteIds: ReadonlySet<string>, all: readonly Row[]): string[] {
	const doomed = all.filter((row) => deleteIds.has(row.id));
	if (doomed.length === 0) return [];
	const kept = readDaysOf(all.filter((row) => !deleteIds.has(row.id)));
	return [...readDaysOf(doomed)].filter((day) => !kept.has(day)).sort();
}
