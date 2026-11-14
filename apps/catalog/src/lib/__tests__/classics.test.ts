import { describe, expect, it } from "vitest";
import { CLASSIC_IDS } from "../classics.js";

describe("CLASSIC_IDS", () => {
	it("lists each work once, whatever the translation", () => {
		const works = CLASSIC_IDS.map((id) => id.split("/").slice(0, 2).join("/"));
		expect(new Set(works).size).toBe(works.length);
	});

	it("has no Gutenberg copy of a title it lists from Standard Ebooks", () => {
		const seCopies = ["1342", "11", "84", "1661", "2701", "98"].map((n) => `gutenberg:${n}`);
		expect(CLASSIC_IDS.filter((id) => seCopies.includes(id))).toEqual([]);
	});
});
