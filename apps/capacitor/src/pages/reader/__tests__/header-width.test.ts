import { describe, expect, it } from "vitest";
import { isReaderHeaderNarrow, isReaderTitleHidden } from "../header-width";

const at = (widthPx: number, hasSeriesNav: boolean, remPx = 16) =>
	isReaderHeaderNarrow({ widthPx, remPx, hasSeriesNav });

describe("isReaderHeaderNarrow", () => {
	it("keeps Listen and Bookmark in the header of a 390px phone", () => {
		expect(at(390, false)).toBe(false);
	});

	it("folds them on a 390-412px phone when series chapter buttons share the row", () => {
		expect(at(390, true)).toBe(true);
		expect(at(412, true)).toBe(true);
		expect(at(440, true)).toBe(false);
	});

	it("folds sooner under a large app font", () => {
		expect(at(390, false, 20)).toBe(true);
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
