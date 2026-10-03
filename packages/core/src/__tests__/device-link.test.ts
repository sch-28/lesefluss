import { describe, expect, it } from "vitest";
import {
	DEVICE_LINK_CODE_ALPHABET,
	DEVICE_LINK_CODE_LENGTH,
	formatDeviceLinkCode,
	isDeviceLinkCode,
	normalizeDeviceLinkCode,
} from "../device-link";

describe("device link codes", () => {
	it("uses an alphabet without look-alike characters", () => {
		for (const char of "01OIoi") expect(DEVICE_LINK_CODE_ALPHABET).not.toContain(char);
		expect(new Set(DEVICE_LINK_CODE_ALPHABET).size).toBe(DEVICE_LINK_CODE_ALPHABET.length);
	});

	it("normalises what a user types", () => {
		expect(normalizeDeviceLinkCode("abcd-2345")).toBe("ABCD2345");
		expect(normalizeDeviceLinkCode(" ab cd 23 45 ")).toBe("ABCD2345");
	});

	it("accepts exactly eight characters from the alphabet", () => {
		expect(isDeviceLinkCode("ABCD2345")).toBe(true);
		expect(isDeviceLinkCode("ABCD234")).toBe(false);
		expect(isDeviceLinkCode("ABCD23450")).toBe(false);
		expect(isDeviceLinkCode("ABCD0345")).toBe(false);
		expect(isDeviceLinkCode("abcd2345")).toBe(false);
	});

	it("prints the code in two halves", () => {
		expect(DEVICE_LINK_CODE_LENGTH).toBe(8);
		expect(formatDeviceLinkCode("ABCD2345")).toBe("ABCD-2345");
		expect(formatDeviceLinkCode("ABC")).toBe("ABC");
	});
});
