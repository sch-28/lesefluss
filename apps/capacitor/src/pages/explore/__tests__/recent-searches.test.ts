import { beforeEach, describe, expect, it } from "vitest";
import {
	clearRecentSearches,
	readRecentSearches,
	recordRecentSearch,
	removeRecentSearch,
} from "../recent-searches";

beforeEach(() => localStorage.clear());

describe("recent searches", () => {
	it("keeps the newest first and dedupes case-insensitively", () => {
		recordRecentSearch("Dracula");
		recordRecentSearch("cradle");
		recordRecentSearch("dracula");
		expect(readRecentSearches()).toEqual(["dracula", "cradle"]);
	});

	it("caps the list", () => {
		for (let i = 0; i < 12; i++) recordRecentSearch(`q${i}`);
		expect(readRecentSearches()).toHaveLength(8);
		expect(readRecentSearches()[0]).toBe("q11");
	});

	it("ignores blank queries", () => {
		recordRecentSearch("   ");
		expect(readRecentSearches()).toEqual([]);
	});

	it("removes one entry or clears all", () => {
		recordRecentSearch("a");
		recordRecentSearch("b");
		expect(removeRecentSearch("a")).toEqual(["b"]);
		clearRecentSearches();
		expect(readRecentSearches()).toEqual([]);
	});

	it("survives corrupt storage", () => {
		localStorage.setItem("explore-recent-searches", "{not json");
		expect(readRecentSearches()).toEqual([]);
	});
});
