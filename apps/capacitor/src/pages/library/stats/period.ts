import { startOfLocalDay } from "../../../utils/date-utils";

const MS_PER_DAY = 86_400_000;

export const PERIODS = ["today", "7d", "30d", "all"] as const;
export type Period = (typeof PERIODS)[number];

export function isPeriod(value: unknown): value is Period {
	return typeof value === "string" && (PERIODS as readonly string[]).includes(value);
}

export interface PeriodWindow {
	start: number;
	prevStart: number;
	prevEnd: number;
}

export function periodWindow(period: Period, now: number): PeriodWindow {
	switch (period) {
		case "today": {
			const start = startOfLocalDay(now);
			return { start, prevStart: start - MS_PER_DAY, prevEnd: start };
		}
		case "7d": {
			const start = startOfLocalDay(now) - 6 * MS_PER_DAY;
			return { start, prevStart: start - 7 * MS_PER_DAY, prevEnd: start };
		}
		case "30d": {
			const start = startOfLocalDay(now) - 29 * MS_PER_DAY;
			return { start, prevStart: start - 30 * MS_PER_DAY, prevEnd: start };
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
