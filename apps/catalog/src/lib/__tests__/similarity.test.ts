import { describe, expect, it } from "vitest";
import { similarityWeights } from "../similarity.js";

const counts = new Map([
	["fiction", 5000],
	["travel", 1200],
	["biography", 1100],
	["childrens", 900],
	["poetry", 800],
	["memoirs", 120],
	["ghost-stories", 40],
]);

describe("similarityWeights", () => {
	it("weights rare tags above broad ones", () => {
		const { weights } = similarityWeights(["fiction", "ghost-stories"], counts, 18_000);
		const w = Object.fromEntries(weights.map((x) => [x.id, x.weight]));
		expect(w["ghost-stories"]).toBeGreaterThan((w.fiction ?? 0) * 3);
	});

	it("never counts the five broadest tags as a specific match", () => {
		expect(similarityWeights(["fiction", "travel", "biography"], counts, 18_000).specific).toEqual(
			[],
		);
		expect(similarityWeights(["biography", "memoirs"], counts, 18_000).specific).toEqual([
			"memoirs",
		]);
	});

	it("ignores tags the counts don't know", () => {
		expect(similarityWeights(["gone"], counts, 18_000)).toEqual({ weights: [], specific: [] });
	});
});
