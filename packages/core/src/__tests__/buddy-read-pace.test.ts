import { describe, expect, test } from "vitest";
import { isOnPace } from "../social";

const DAY = 86_400_000;
const start = 1_000 * DAY;

describe("isOnPace", () => {
	test("is unknown without a percent or a target date", () => {
		expect(isOnPace({ percent: null, createdAt: start, targetDate: start + DAY, now: start })).toBe(
			null,
		);
		expect(isOnPace({ percent: 50, createdAt: start, targetDate: null, now: start })).toBe(null);
	});

	test("compares the percent with the elapsed share of the schedule", () => {
		const input = { createdAt: start, targetDate: start + 10 * DAY, now: start + 4 * DAY };
		expect(isOnPace({ ...input, percent: 40 })).toBe(true);
		expect(isOnPace({ ...input, percent: 39 })).toBe(false);
	});

	test("past the target date only a finished reader is on pace", () => {
		const input = { createdAt: start, targetDate: start + DAY, now: start + 5 * DAY };
		expect(isOnPace({ ...input, percent: 99 })).toBe(false);
		expect(isOnPace({ ...input, percent: 100 })).toBe(true);
	});

	test("a target at or before the start needs the finished threshold", () => {
		const input = { createdAt: start, targetDate: start, now: start };
		expect(isOnPace({ ...input, percent: 94 })).toBe(false);
		expect(isOnPace({ ...input, percent: 95 })).toBe(true);
	});

	test("at the very start nobody is behind", () => {
		expect(
			isOnPace({ percent: 0, createdAt: start, targetDate: start + 3 * DAY, now: start + 60_000 }),
		).toBe(true);
	});

	test("before the start counts as nothing elapsed", () => {
		expect(
			isOnPace({ percent: 0, createdAt: start, targetDate: start + DAY, now: start - DAY }),
		).toBe(true);
	});
});
