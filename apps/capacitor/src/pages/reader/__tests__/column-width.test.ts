import { describe, expect, it } from "vitest";
import { readerColumnWidthPx } from "../column-width";

describe("readerColumnWidthPx", () => {
	it("narrows the column to a ~68 character line at the default text size", () => {
		expect(readerColumnWidthPx(16, 20)).toBe(552);
	});

	it("grows with the text size and the margins", () => {
		expect(readerColumnWidthPx(18, 20)).toBeGreaterThan(readerColumnWidthPx(16, 20));
		expect(readerColumnWidthPx(16, 40)).toBe(readerColumnWidthPx(16, 20) + 40);
	});

	it("never passes 700 px", () => {
		expect(readerColumnWidthPx(28, 48)).toBe(700);
	});
});
