import { describe, expect, it } from "vitest";
import { readerColumnWidthPx } from "../column-width";
import { headerRowWidthPx, isReaderHeaderNarrow, isReaderTitleHidden } from "../header-width";

const at = (widthPx: number, hasSeriesNav: boolean, remPx = 16) =>
	isReaderHeaderNarrow({ widthPx, remPx, hasSeriesNav });

describe("isReaderHeaderNarrow", () => {
	it("folds Listen and Bookmark on every phone, up to 430px", () => {
		expect(at(360, false)).toBe(true);
		expect(at(412, false)).toBe(true);
		expect(at(430, false)).toBe(true);
	});

	it("keeps them on a tablet and in the default desktop column", () => {
		const row = headerRowWidthPx(1920, readerColumnWidthPx(16, 20));
		expect(at(row, false)).toBe(false);
		expect(at(row, true)).toBe(false);
		expect(at(820, true)).toBe(false);
	});

	it("folds a wide desktop header whose column is narrow at the smallest text", () => {
		expect(at(headerRowWidthPx(1920, readerColumnWidthPx(12, 8)), false)).toBe(true);
	});

	it("measures the full header where the bars are not tied to the column", () => {
		expect(headerRowWidthPx(1920, null)).toBe(1920);
	});

	it("folds a wider header when series chapter buttons share the row", () => {
		expect(at(480, false)).toBe(false);
		expect(at(480, true)).toBe(true);
	});

	it("folds sooner under a large app font", () => {
		expect(at(480, false, 20)).toBe(true);
	});

	it("waits for a measured width", () => {
		expect(at(0, true)).toBe(false);
	});
});

describe("isReaderTitleHidden", () => {
	const hidden = (widthPx: number, hasSeriesNav: boolean, remPx = 16) =>
		isReaderTitleHidden({ widthPx, remPx, hasSeriesNav });

	it("shows the title on a 360px phone at the default font, series or not", () => {
		expect(hidden(360, false)).toBe(false);
		expect(hidden(390, true)).toBe(false);
	});

	it("hides it on a phone at Android's 200 % font scale", () => {
		expect(hidden(412, false, 32)).toBe(true);
	});

	it("waits for a measured width", () => {
		expect(hidden(0, false, 32)).toBe(false);
	});
});
