import { describe, expect, it } from "vitest";
import {
	duplicateNumbers,
	formatSeriesNumber,
	highestNumber,
	nextSeriesNumber,
	parseSeriesNumber,
	planSeriesNumbers,
} from "../series-numbering";

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

	it("renumbers from 1 around the numbers other members hold, and clears every number while the books stay in", () => {
		expect([...planSeriesNumbers(["y", "a"], members, "fromOne")]).toEqual([
			["y", 2],
			["a", 3],
		]);
		expect(duplicateNumbers(planSeriesNumbers(["y", "a"], members, "fromOne"), members)).toEqual(
			new Set(),
		);
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

describe("nextSeriesNumber", () => {
	it("is the whole number after the highest, 1 for an empty series", () => {
		expect(nextSeriesNumber(members)).toBe(3);
		expect(nextSeriesNumber(new Map())).toBe(1);
	});
});

describe("duplicateNumbers", () => {
	it("finds a number two books in the plan share", () => {
		const plan = new Map([
			["a", 3],
			["b", 3],
		]);
		expect(duplicateNumbers(plan, members)).toEqual(new Set([3]));
	});

	it("finds a number a member outside the plan already holds", () => {
		expect(duplicateNumbers(new Map([["a", 1]]), members)).toEqual(new Set([1]));
	});

	it("lets a member in the plan give up its own number", () => {
		expect(
			duplicateNumbers(
				new Map([
					["x", 4],
					["a", 1],
				]),
				members,
			),
		).toEqual(new Set());
	});

	it("leaves a number two members outside the plan already share alone", () => {
		const editions = new Map<string, number | null>([
			["x", 1],
			["x2", 1],
		]);
		expect(duplicateNumbers(new Map([["a", 2]]), editions)).toEqual(new Set());
		expect(duplicateNumbers(new Map([["a", 1]]), editions)).toEqual(new Set([1]));
	});
});

describe("parseSeriesNumber", () => {
	it("reads #N, decimals with a comma, and empty as no number", () => {
		expect(parseSeriesNumber("#2")).toBe(2);
		expect(parseSeriesNumber("2,5")).toBe(2.5);
		expect(parseSeriesNumber(" ")).toBeNull();
	});

	it("refuses zero, negatives and text", () => {
		expect(parseSeriesNumber("0")).toBeUndefined();
		expect(parseSeriesNumber("-1")).toBeUndefined();
		expect(parseSeriesNumber("two")).toBeUndefined();
	});
});
