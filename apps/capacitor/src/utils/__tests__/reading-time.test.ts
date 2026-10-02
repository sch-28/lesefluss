import { describe, expect, it } from "vitest";
import { AVERAGE_READER_WPM, readingPace } from "../reading-time";

describe("readingPace", () => {
	it("uses the reader's measured speed", () => {
		expect(readingPace(312)).toEqual({ wpm: 312, isMeasured: true });
	});

	it("falls back to a typical reader before anything is measured", () => {
		for (const measured of [null, undefined, 0]) {
			expect(readingPace(measured)).toEqual({ wpm: AVERAGE_READER_WPM, isMeasured: false });
		}
	});
});
