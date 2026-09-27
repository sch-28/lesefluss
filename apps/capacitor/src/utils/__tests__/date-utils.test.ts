import { describe, expect, it } from "vitest";
import { formatAgo, formatRelative } from "../date-utils";

describe("formatAgo", () => {
	const now = new Date(2026, 8, 27, 3, 0).getTime();
	const MIN = 60_000;

	it("counts minutes and hours within the last day", () => {
		expect(formatAgo(now - 59_000, now)).toBe("just now");
		expect(formatAgo(now - 61_000, now)).toBe("1 min ago");
		expect(formatAgo(now - 59 * MIN, now)).toBe("59 min ago");
		// Three hours ago is the previous calendar day here, which formatRelative calls "yesterday".
		expect(formatAgo(now - 180 * MIN, now)).toBe("3 h ago");
		expect(formatAgo(now - (24 * 60 - 1) * MIN, now)).toBe("23 h ago");
	});

	it("falls back to the calendar wording after a day", () => {
		const twoDays = now - 2 * 24 * 60 * MIN;
		expect(formatAgo(twoDays, now)).toBe(formatRelative(twoDays, now));
	});
});
