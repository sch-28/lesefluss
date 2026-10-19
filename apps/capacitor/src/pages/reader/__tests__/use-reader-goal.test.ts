import { describe, expect, it } from "vitest";
import { furthestReadFor, withFurthestRead } from "../use-reader-goal";

const empty = { key: "", bySitting: {} };

describe("furthest read today", () => {
	it("is null until a sitting of this book and day has read something", () => {
		expect(furthestReadFor(empty, "b:2026-03-01")).toBeNull();
	});

	it("takes the furthest of the day's sittings, a mode switch's included", () => {
		let read = withFurthestRead(empty, "b:2026-03-01", "s1", 130);
		read = withFurthestRead(read, "b:2026-03-01", "s2", 90);
		expect(furthestReadFor(read, "b:2026-03-01")).toBe(130);
	});

	it("drops a discarded sitting", () => {
		let read = withFurthestRead(empty, "b:2026-03-01", "s1", 60);
		read = withFurthestRead(read, "b:2026-03-01", "s2", 130);
		read = withFurthestRead(read, "b:2026-03-01", "s2", null);
		expect(furthestReadFor(read, "b:2026-03-01")).toBe(60);
	});

	it("starts over for another book or day", () => {
		let read = withFurthestRead(empty, "b:2026-03-01", "s1", 130);
		expect(furthestReadFor(read, "b:2026-03-02")).toBeNull();
		read = withFurthestRead(read, "c:2026-03-01", "s2", 20);
		expect(furthestReadFor(read, "b:2026-03-01")).toBeNull();
		expect(furthestReadFor(read, "c:2026-03-01")).toBe(20);
	});
});
