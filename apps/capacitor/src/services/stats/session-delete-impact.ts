import { REAL_SITTING_MS } from "@lesefluss/core";
import { readDaysOf, type SessionTiming } from "./aggregate";

type Row = SessionTiming & { id: string };

/** Reading days the streak loses when `deleteIds` go: days no other real sitting still reads on. */
export function lostReadingDays(deleteIds: ReadonlySet<string>, all: readonly Row[]): string[] {
	const real = all.filter((row) => row.durationMs >= REAL_SITTING_MS);
	const doomed = real.filter((row) => deleteIds.has(row.id));
	if (doomed.length === 0) return [];
	const kept = readDaysOf(real.filter((row) => !deleteIds.has(row.id)));
	return [...readDaysOf(doomed)].filter((day) => !kept.has(day)).sort();
}
