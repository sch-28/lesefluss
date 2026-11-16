import { describe, expect, it } from "vitest";
import { formatDayTick } from "../chart-axis";

describe("formatDayTick", () => {
	it("never adds a year, so ticks around New Year keep one width", () => {
		const lastYear = new Date(new Date().getFullYear() - 1, 11, 30).getTime();
		const thisYear = new Date(new Date().getFullYear(), 0, 2).getTime();
		expect(formatDayTick(lastYear)).toBe("Dec 30");
		expect(formatDayTick(thisYear)).toBe("Jan 2");
	});
});
