import type { TrendPeriod } from "../../../services/stats/aggregate";
import { startOfLocalDay } from "../../../utils/date-utils";

const MS_PER_DAY = 86_400_000;

export const PERIODS = ["today", "7d", "30d", "all"] as const;

/** Same set the trend bucketing works in; kept as one definition. */
export type Period = TrendPeriod;

export function isPeriod(value: unknown): value is Period {
	return typeof value === "string" && (PERIODS as readonly string[]).includes(value);
}

export interface PeriodWindow {
	start: number;
	prevStart: number;
	prevEnd: number;
}

/**
 * The previous window is clipped to the same elapsed offset as the current one.
 * Comparing a partial today against a whole yesterday made the delta arrow red
 * for most of the day no matter how much had been read.
 */
export function periodWindow(period: Period, now: number): PeriodWindow {
	switch (period) {
		case "today": {
			const start = startOfLocalDay(now);
			const elapsed = now - start;
			return { start, prevStart: start - MS_PER_DAY, prevEnd: start - MS_PER_DAY + elapsed };
		}
		case "7d": {
			const start = startOfLocalDay(now) - 6 * MS_PER_DAY;
			const elapsed = now - start;
			return {
				start,
				prevStart: start - 7 * MS_PER_DAY,
				prevEnd: start - 7 * MS_PER_DAY + elapsed,
			};
		}
		case "30d": {
			const start = startOfLocalDay(now) - 29 * MS_PER_DAY;
			const elapsed = now - start;
			return {
				start,
				prevStart: start - 30 * MS_PER_DAY,
				prevEnd: start - 30 * MS_PER_DAY + elapsed,
			};
		}
		default:
			return { start: 0, prevStart: 0, prevEnd: 0 };
	}
}

export const PERIOD_LABELS: Record<Period, string> = {
	today: "Today",
	"7d": "Last 7 days",
	"30d": "Last 30 days",
	all: "All time",
};
