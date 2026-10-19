import { describe, expect, it } from "vitest";
import { axisTicks } from "../goal-chart";

describe("goal chart x-axis", () => {
	it("starts at the goal's first day, not the anchor the day before", () => {
		expect(axisTicks(false, 30)).toEqual([1, 30]);
	});

	it("starts where the history starts when there is history", () => {
		expect(axisTicks(true, 40)).toEqual([0, 40]);
	});

	it("shows one label for a one-day goal", () => {
		expect(axisTicks(false, 1)).toEqual([1]);
	});
});
