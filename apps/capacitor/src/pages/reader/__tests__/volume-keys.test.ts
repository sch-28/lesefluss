import { describe, expect, it } from "vitest";
import { volumeKeysFor } from "../../../hooks/use-appearance-settings";
import { volumeKeyAction } from "../use-keyboard-shortcuts";
import { clampWpm } from "../wpm";

describe("volumeKeyAction", () => {
	const page = { readerMode: "standard" as const, paginationStyle: "page" as const, invert: false };

	it("turns forward on volume down in page mode", () => {
		expect(volumeKeyAction({ ...page, key: "down" })).toBe("next");
		expect(volumeKeyAction({ ...page, key: "up" })).toBe("prev");
	});

	it("swaps page direction when inverted", () => {
		expect(volumeKeyAction({ ...page, invert: true, key: "down" })).toBe("prev");
		expect(volumeKeyAction({ ...page, invert: true, key: "up" })).toBe("next");
	});

	it("changes speed in RSVP, up always faster", () => {
		for (const invert of [false, true]) {
			const rsvp = { readerMode: "rsvp" as const, paginationStyle: "scroll" as const, invert };
			expect(volumeKeyAction({ ...rsvp, key: "up" })).toBe("faster");
			expect(volumeKeyAction({ ...rsvp, key: "down" })).toBe("slower");
		}
	});

	it("does nothing in scroll mode", () => {
		expect(volumeKeyAction({ ...page, paginationStyle: "scroll", key: "down" })).toBeNull();
	});
});

describe("volumeKeysFor", () => {
	it("follows E-ink mode until the user picks", () => {
		const unset = { volumeKeyPageTurn: null, volumeKeyInvert: false };
		expect(volumeKeysFor(unset, false).enabled).toBe(false);
		expect(volumeKeysFor(unset, true).enabled).toBe(true);
		expect(volumeKeysFor(undefined, true).enabled).toBe(true);
	});

	it("keeps an explicit choice over E-ink mode", () => {
		expect(volumeKeysFor({ volumeKeyPageTurn: false, volumeKeyInvert: false }, true).enabled).toBe(
			false,
		);
		expect(volumeKeysFor({ volumeKeyPageTurn: true, volumeKeyInvert: true }, false)).toEqual({
			enabled: true,
			invert: true,
		});
	});
});

describe("clampWpm", () => {
	it("keeps WPM inside the setting range", () => {
		expect(clampWpm(75)).toBe(100);
		expect(clampWpm(1025)).toBe(1000);
		expect(clampWpm(300)).toBe(300);
	});
});
