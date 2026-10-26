import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, SETTING_CONSTRAINTS } from "../settings";

const isOnGrid = (value: number, { min, step }: { min: number; step: number }) => {
	const steps = (value - min) / step;
	return Math.abs(steps - Math.round(steps)) < 1e-9;
};

describe("reader spacing settings", () => {
	it.each([
		"READER_LETTER_SPACING",
		"READER_WORD_SPACING",
		"READER_PARAGRAPH_SPACING",
	] as const)("%s defaults inside its range, on a step", (key) => {
		const range = SETTING_CONSTRAINTS[key];
		const value = DEFAULT_SETTINGS[key];
		expect(value).toBeGreaterThanOrEqual(range.min);
		expect(value).toBeLessThanOrEqual(range.max);
		expect(isOnGrid(value, range)).toBe(true);
	});

	it.each([
		["READER_LETTER_SPACING", 0.12],
		["READER_WORD_SPACING", 0.16],
		["READER_PARAGRAPH_SPACING", 2],
	] as const)("%s reaches WCAG 1.4.12's %s em exactly", (key, wcag) => {
		const range = SETTING_CONSTRAINTS[key];
		expect(wcag).toBeLessThanOrEqual(range.max);
		expect(isOnGrid(wcag, range)).toBe(true);
	});
});
