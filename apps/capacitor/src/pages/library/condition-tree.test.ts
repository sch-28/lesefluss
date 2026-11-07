import { describe, expect, it } from "vitest";
import {
	type ConditionTree,
	filterToTree,
	matchesTree,
	parseTree,
	serializeTree,
	treeToFilter,
} from "./condition-tree";
import {
	FACETS,
	type Facet,
	type FacetValues,
	type LibraryFilter,
	matchesFilter,
} from "./filter-model";

const POOL = ["a", "b", "c"];

/** Deterministic, so a failure reproduces from the same seed. */
function rng(seed: number) {
	let s = seed >>> 0;
	return () => {
		s = (s * 1664525 + 1013904223) >>> 0;
		return s / 2 ** 32;
	};
}

function subset(rand: () => number): string[] {
	return POOL.filter(() => rand() < 0.35);
}

function randomFilter(rand: () => number): LibraryFilter {
	const filter: LibraryFilter = {};
	for (const facet of FACETS) {
		if (rand() < 0.5) continue;
		const include = subset(rand);
		const exclude = subset(rand).filter((v) => !include.includes(v));
		if (include.length + exclude.length === 0) continue;
		filter[facet] = {
			in: include,
			out: exclude,
			...(facet === "tags" && include.length > 1 && rand() < 0.5 && { mode: "all" as const }),
		};
	}
	if (rand() < 0.3) {
		const min = rand() < 0.5 ? Math.floor(rand() * 50_000) : undefined;
		const max = rand() < 0.5 ? 50_000 + Math.floor(rand() * 50_000) : undefined;
		if (min != null || max != null) filter.words = { min, max };
	}
	return filter;
}

function randomValues(rand: () => number): FacetValues {
	const values = Object.fromEntries(FACETS.map((f) => [f, subset(rand)])) as Record<
		Facet,
		string[]
	>;
	return {
		...values,
		wordCount: rand() < 0.2 ? null : Math.floor(rand() * 100_000),
		raw: { title: "", author: "", rating: null, progress: 0, addedAt: 0, lastRead: null },
	};
}

describe("condition tree", () => {
	it("matches exactly the books the chips match, for any filter", () => {
		const rand = rng(125_3);
		for (let i = 0; i < 2_000; i++) {
			const filter = randomFilter(rand);
			const tree = filterToTree(filter);
			for (let j = 0; j < 10; j++) {
				const values = randomValues(rand);
				expect(matchesTree(values, tree.root), JSON.stringify({ filter, values })).toBe(
					matchesFilter(values, filter),
				);
			}
		}
	});

	it("turns back into the same chips after a storage round trip", () => {
		const rand = rng(7);
		for (let i = 0; i < 500; i++) {
			const filter = randomFilter(rand);
			const stored = parseTree(serializeTree(filterToTree(filter)));
			expect(stored).not.toBeNull();
			const back = treeToFilter(stored as ConditionTree);
			expect(back).not.toBeNull();
			expect(filterToTree(back as LibraryFilter)).toEqual(filterToTree(filter));
		}
	});

	it("an unknown field or operator matches no book, also inside an OR", () => {
		const values = randomValues(rng(1));
		const unknownField: ConditionTree = {
			v: 1,
			root: { op: "and", items: [{ field: "mood", op: "is", value: "happy" }] },
		};
		const unknownOp = parseTree(
			JSON.stringify({
				v: 1,
				root: { op: "xor", items: [{ field: "tags", op: "is", value: "a" }] },
			}),
		);
		expect(matchesTree(values, unknownField.root)).toBe(false);
		expect(unknownOp).not.toBeNull();
		expect(matchesTree(values, (unknownOp as ConditionTree).root)).toBe(false);
		expect(treeToFilter(unknownField)).toBeNull();
	});

	it("keeps a malformed child as a condition that matches nothing", () => {
		const tree = parseTree(JSON.stringify({ v: 1, root: { op: "or", items: [42] } }));
		expect(tree?.root.items).toHaveLength(1);
		expect(matchesTree(randomValues(rng(2)), (tree as ConditionTree).root)).toBe(false);
	});

	it("rejects what is not a version-1 tree", () => {
		expect(parseTree("not json")).toBeNull();
		expect(parseTree(JSON.stringify({ v: 2, root: { op: "and", items: [] } }))).toBeNull();
		expect(
			parseTree(JSON.stringify({ v: 1, root: { field: "tags", op: "is", value: "a" } })),
		).toBeNull();
	});

	it("gives no chips for a nested group or an OR across facets", () => {
		const nested: ConditionTree = {
			v: 1,
			root: {
				op: "and",
				items: [{ op: "or", items: [{ op: "and", items: [] }] }],
			},
		};
		const across: ConditionTree = {
			v: 1,
			root: {
				op: "and",
				items: [
					{
						op: "or",
						items: [
							{ field: "tags", op: "is", value: "a" },
							{ field: "author", op: "is", value: "b" },
						],
					},
				],
			},
		};
		expect(treeToFilter(nested)).toBeNull();
		expect(treeToFilter(across)).toBeNull();
	});

	it("does not overflow on a deeply nested tree", () => {
		const depth = 5_000;
		const leaf = '{"field":"tags","op":"is","value":"a"}';
		const root = '{"op":"and","items":['.repeat(depth) + leaf + "]}".repeat(depth);
		const tree = parseTree(`{"v":1,"root":${root}}`);
		expect(tree).not.toBeNull();
		expect(
			matchesTree({ ...randomValues(rng(3)), tags: ["a"] }, (tree as ConditionTree).root),
		).toBe(false);
	});
});
