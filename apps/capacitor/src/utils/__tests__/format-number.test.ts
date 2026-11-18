import { describe, expect, it } from "vitest";
import { formatCount } from "../format-number";

describe("formatCount", () => {
	it("groups thousands the same way whatever the device locale", () => {
		expect(formatCount(12345)).toBe("12,345");
		expect(formatCount(1234567.6)).toBe("1,234,568");
		expect(formatCount(0)).toBe("0");
	});
});
