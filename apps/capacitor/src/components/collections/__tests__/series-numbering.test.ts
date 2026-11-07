import { describe, expect, it } from "vitest";
import { formatSeriesNumber, highestNumber, planSeriesNumbers } from "../series-numbering";

const members = new Map<string, number | null>([
	["x", 1],
	["y", 2.5],
	["z", null],
]);

describe("planSeriesNumbers", () => {
	it("numbers new books after the highest whole number, in the order given", () => {
		expect([...planSeriesNumbers(["b", "a"], members, "append")]).toEqual([
			["b", 3],
			["a", 4],
		]);
	});

	it("keeps a member's own number and numbers an unnumbered member after the rest", () => {
		expect([...planSeriesNumbers(["y", "z", "n"], members, "append")]).toEqual([
			["y", 2.5],
			["z", 3],
			["n", 4],
		]);
	});

	it("starts a new series at 1", () => {
		expect([...planSeriesNumbers(["a", "b"], new Map(), "append")]).toEqual([
			["a", 1],
			["b", 2],
		]);
	});

	it("renumbers 1..N, and clears every number while the books stay in", () => {
		expect([...planSeriesNumbers(["y", "a"], members, "fromOne")]).toEqual([
			["y", 1],
			["a", 2],
		]);
		expect([...planSeriesNumbers(["y", "a"], members, "clear")]).toEqual([
			["y", null],
			["a", null],
		]);
	});

	it("numbers a book picked twice once", () => {
		expect([...planSeriesNumbers(["a", "a"], new Map(), "fromOne")]).toEqual([["a", 1]]);
	});
});

describe("highestNumber", () => {
	it("is 0 for an unnumbered collection", () => {
		expect(highestNumber(new Map([["z", null]]))).toBe(0);
		expect(highestNumber(members)).toBe(2.5);
	});

	it("formats as #N", () => {
		expect(formatSeriesNumber(2.5)).toBe("#2.5");
	});
});
