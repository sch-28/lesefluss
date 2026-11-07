import { describe, expect, it } from "vitest";
import { isConditionComplete, withField, withOperator } from "../condition-fields";
import {
	type Condition,
	type ConditionGroup,
	type ConditionNode,
	filterToTree,
	localDayStart,
	matchesTree,
	treeToFilter,
} from "../condition-tree";
import { type FacetValues, type FilterFields, facetValuesOf } from "../filter-model";

// Local noon on 2026-11-07, so whole-day edges sit well away from `NOW`.
const NOW = new Date(2026, 10, 7, 12).getTime();
const day = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();

function book(fields: Partial<FilterFields> = {}): FacetValues {
	return facetValuesOf(
		{
			title: "The Left Hand of Darkness",
			status: "reading",
			tags: ["scifi"],
			author: "Ursula K. Le Guin",
			seriesId: null,
			collectionIds: [],
			wordCount: 90_000,
			rating: 8,
			progress: 40,
			addedAt: day(2026, 10, 1),
			lastRead: day(2026, 11, 5),
			...fields,
		},
		NOW,
	);
}

const and = (...items: ConditionNode[]): ConditionGroup => ({ op: "and", items });
const or = (...items: ConditionNode[]): ConditionGroup => ({ op: "or", items });
const c = (field: string, op: string, value: unknown = null): Condition => ({ field, op, value });
const matches = (values: FacetValues, ...items: ConditionNode[]) =>
	matchesTree(values, and(...items), NOW);

describe("condition operators", () => {
	it("compares length, progress and stars as numbers", () => {
		const b = book();
		expect(matches(b, c("words", "gte", 90_000))).toBe(true);
		expect(matches(b, c("words", "lte", 89_999))).toBe(false);
		expect(matches(b, c("words", "between", { min: 100_000, max: 50_000 }))).toBe(true);
		expect(matches(b, c("progress", "between", { min: 41, max: 100 }))).toBe(false);
		expect(matches(b, c("progress", "gte", 40))).toBe(true);
		expect(matches(b, c("rating", "gte", 4))).toBe(true);
		expect(matches(b, c("rating", "lte", 3))).toBe(false);
		expect(matches(book({ rating: null }), c("rating", "gte", 0))).toBe(false);
	});

	it("finds text case-insensitively and never matches an empty needle", () => {
		const b = book();
		expect(matches(b, c("title", "contains", "  left HAND "))).toBe(true);
		expect(matches(b, c("title", "notContains", "dune"))).toBe(true);
		expect(matches(b, c("author", "contains", "le guin"))).toBe(true);
		expect(matches(b, c("author", "notContains", "Guin"))).toBe(false);
		expect(matches(b, c("title", "contains", " "))).toBe(false);
		expect(matches(b, c("title", "notContains", ""))).toBe(false);
	});

	it("tells empty fields apart", () => {
		const bare = book({ tags: [], author: "", rating: null, lastRead: null, wordCount: 0 });
		for (const field of ["tags", "author", "rating", "lastRead", "words"]) {
			expect(matches(bare, c(field, "empty")), field).toBe(true);
			expect(matches(book(), c(field, "empty")), field).toBe(false);
		}
		expect(matches(bare, c("series", "empty"), c("collection", "empty"))).toBe(true);
	});

	it("counts relative dates in whole local days from the day the shelf is shown", () => {
		const within = (days: number, at: number) =>
			matches(book({ lastRead: at }), c("lastRead", "within", days));
		expect(within(0, day(2026, 11, 7, 0))).toBe(true);
		expect(within(0, day(2026, 11, 6, 23))).toBe(false);
		expect(within(2, day(2026, 11, 5, 0))).toBe(true);
		expect(within(2, day(2026, 11, 4, 23))).toBe(false);
		// The same book, the next day: the window moved with it.
		const read = book({ lastRead: day(2026, 11, 5, 0) });
		const tomorrow = day(2026, 11, 8);
		expect(matchesTree(read, and(c("lastRead", "within", 2)), tomorrow)).toBe(false);
		expect(matches(book({ lastRead: null }), c("lastRead", "within", 365))).toBe(false);
	});

	it("puts before and after on either side of the whole day", () => {
		const added = (at: number, op: string) =>
			matches(book({ addedAt: at }), c("added", op, "2026-10-01"));
		expect(added(day(2026, 9, 30, 23), "before")).toBe(true);
		expect(added(day(2026, 10, 1, 0), "before")).toBe(false);
		expect(added(day(2026, 10, 1, 23), "after")).toBe(false);
		expect(added(day(2026, 10, 2, 0), "after")).toBe(true);
		expect(added(day(2026, 10, 2), "after")).toBe(true);
		expect(matches(book(), c("added", "after", "2026-02-30"))).toBe(false);
	});

	it("nests all and any groups", () => {
		const tree = and(
			c("status", "is", "reading"),
			or(c("tags", "is", "fantasy"), and(c("words", "lte", 100_000), c("rating", "gte", 4))),
		);
		expect(matchesTree(book(), tree, NOW)).toBe(true);
		expect(matchesTree(book({ rating: 6 }), tree, NOW)).toBe(false);
		expect(matchesTree(book({ rating: 6, tags: ["fantasy"] }), tree, NOW)).toBe(true);
		expect(matchesTree(book({ status: "finished", tags: ["fantasy"] }), tree, NOW)).toBe(false);
		// An empty any-group matches nothing, an empty all-group everything.
		expect(matchesTree(book(), and(or()), NOW)).toBe(false);
		expect(matchesTree(book(), and(and()), NOW)).toBe(true);
	});

	it("gives no chips for the operators the chips cannot show", () => {
		for (const cond of [
			c("words", "between", { min: 1, max: 2 }),
			c("title", "contains", "x"),
			c("tags", "empty"),
			c("added", "within", 7),
			c("rating", "gte", 3),
		]) {
			expect(treeToFilter({ v: 1, root: and(cond) }), cond.op).toBeNull();
		}
		const chips = { tags: { in: ["a", "b"], out: ["c"] }, status: { in: ["reading"], out: [] } };
		expect(treeToFilter(filterToTree(chips))).toEqual(chips);
	});
});

describe("condition values", () => {
	it("reads a real local day only", () => {
		expect(localDayStart("2026-11-07")).toBe(new Date(2026, 10, 7).getTime());
		expect(localDayStart("2026-11-07", 1)).toBe(new Date(2026, 10, 8).getTime());
		expect(localDayStart("2026-13-01")).toBeNull();
		expect(localDayStart("7.11.2026")).toBeNull();
		expect(localDayStart(20261107)).toBeNull();
	});

	it("needs a value for every operator that takes one", () => {
		expect(isConditionComplete(withField("status"))).toBe(false);
		expect(isConditionComplete(c("status", "is", "reading"))).toBe(true);
		expect(isConditionComplete(c("title", "contains", "  "))).toBe(false);
		expect(isConditionComplete(c("rating", "gte", 0))).toBe(false);
		expect(isConditionComplete(c("rating", "gte", 5))).toBe(true);
		expect(isConditionComplete(c("rating", "gte", 6))).toBe(false);
		expect(isConditionComplete(c("words", "gte", -1))).toBe(false);
		expect(isConditionComplete(c("words", "between", { min: 1, max: null }))).toBe(false);
		expect(isConditionComplete(c("words", "between", { min: 0, max: 5 }))).toBe(true);
		expect(isConditionComplete(c("added", "within", 1.5))).toBe(false);
		expect(isConditionComplete(withField("added"))).toBe(true);
		expect(isConditionComplete(c("added", "before", ""))).toBe(false);
		expect(isConditionComplete(c("tags", "empty"))).toBe(true);
		// Written by a newer version: kept, never blocks Save.
		expect(isConditionComplete(c("narrator", "is", ""))).toBe(true);
	});

	it("keeps the value while the operator takes the same kind", () => {
		const atLeast = c("progress", "gte", 50);
		expect(withOperator(atLeast, "lte").value).toBe(50);
		expect(withOperator(atLeast, "between").value).toBeNull();
		expect(withOperator(c("author", "is", "Le Guin"), "contains").value).toBe("");
		expect(withOperator(atLeast, "nonsense")).toBe(atLeast);
	});
});
