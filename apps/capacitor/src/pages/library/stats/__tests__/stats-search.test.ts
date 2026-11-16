import { describe, expect, it } from "vitest";
import { parseStatsSearch } from "../stats-search";

describe("parseStatsSearch", () => {
	it("lands on Overview without a tab", () => {
		expect(parseStatsSearch({})).toEqual({});
	});

	it.each(["overview", "bogus", 3, null])("lands on Overview for tab %s", (tab) => {
		expect(parseStatsSearch({ tab })).toEqual({});
	});

	it("keeps the Speed tab", () => {
		expect(parseStatsSearch({ tab: "speed" })).toEqual({ tab: "speed" });
	});

	it("keeps the Sessions tab with its book filter", () => {
		expect(parseStatsSearch({ tab: "sessions", book: "a1b2c3d4" })).toEqual({
			tab: "sessions",
			book: "a1b2c3d4",
		});
	});

	it("keeps the from-book marker only with a book filter", () => {
		expect(parseStatsSearch({ tab: "sessions", book: "a1b2c3d4", from: "book" })).toEqual({
			tab: "sessions",
			book: "a1b2c3d4",
			from: "book",
		});
		expect(parseStatsSearch({ tab: "sessions", from: "book" })).toEqual({ tab: "sessions" });
		expect(parseStatsSearch({ tab: "sessions", book: "a1b2c3d4", from: "x" })).toEqual({
			tab: "sessions",
			book: "a1b2c3d4",
		});
	});

	it("drops a book filter outside Sessions", () => {
		expect(parseStatsSearch({ tab: "speed", book: "a1b2c3d4" })).toEqual({ tab: "speed" });
	});

	it.each(["", 42, "x".repeat(65)])("drops a malformed book filter %s", (book) => {
		expect(parseStatsSearch({ tab: "sessions", book })).toEqual({ tab: "sessions" });
	});
});
