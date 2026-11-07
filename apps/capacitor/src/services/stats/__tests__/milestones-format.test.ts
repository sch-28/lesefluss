import { describe, expect, it } from "vitest";
import { compactNumber, milestoneFace, milestoneProgress } from "../milestones";

describe("milestone formatting", () => {
	it("keeps numbers short enough for a medal", () => {
		expect(
			[640, 1200, 100_000, 640_000, 1_000_000, 1_200_000, 10_000_000].map(compactNumber),
		).toEqual(["640", "1.2k", "100k", "640k", "1M", "1.2M", "10M"]);
	});

	it("labels each kind tersely, RSVP speed with its badge", () => {
		expect(milestoneFace("words", 1_000_000)).toEqual({
			value: "1M",
			caption: "words",
			rsvp: false,
		});
		expect(milestoneFace("books", 1).caption).toBe("book");
		expect(milestoneFace("hours", 100).value).toBe("100h");
		expect(milestoneFace("streak", 30).caption).toBe("day streak");
		expect(milestoneFace("rsvpWpm", 500)).toEqual({
			value: "500",
			caption: "wpm session",
			rsvp: true,
		});
	});

	it("shows progress toward the next tier", () => {
		expect(milestoneProgress({ kind: "words", threshold: 2_000_000, current: 1_200_000 })).toBe(
			"1.2M / 2M",
		);
		expect(milestoneProgress({ kind: "hours", threshold: 100, current: 87 })).toBe("87h / 100h");
		expect(milestoneProgress({ kind: "books", threshold: 5, current: 4 })).toBe("4 / 5");
	});
});
