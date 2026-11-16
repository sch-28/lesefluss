import { describe, expect, it } from "vitest";
import type { WeekTotal } from "../../../../services/stats/calendar";
import { shownWeeks } from "../activity";

const WEEK = 7 * 86_400_000;
const weeks = (hours: number[]): WeekTotal[] =>
	hours.map((h, i) => ({ weekStart: i * WEEK, hours: h, isCurrent: i === hours.length - 1 }));

describe("shownWeeks", () => {
	it("starts at the first week with reading", () => {
		const shown = shownWeeks(weeks([0, 0, 0, 1, 0, 2, 0, 3]));
		expect(shown.map((w) => w.hours)).toEqual([1, 0, 2, 0, 3]);
	});

	it("keeps at least four weeks for a new reader", () => {
		expect(shownWeeks(weeks([0, 0, 0, 0, 0, 0, 0, 2]))).toHaveLength(4);
	});

	it("keeps every week when none has reading", () => {
		expect(shownWeeks(weeks([0, 0, 0, 0, 0, 0]))).toHaveLength(6);
	});
});
