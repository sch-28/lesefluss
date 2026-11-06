import { describe, expect, it } from "vitest";
import type { SmartShelf } from "../../services/db/schema";
import { filterToTree, serializeTree } from "./condition-tree";
import { FACETS, type Facet, type FacetValues } from "./filter-model";
import {
	builtInShelves,
	isBuiltInShelfId,
	orderShelves,
	parseBuiltInPins,
	shelfCounts,
	shelfEntryOf,
} from "./smart-shelves";

function book(values: Partial<Record<Facet, string[]>>): { facets: FacetValues } {
	const empty = Object.fromEntries(FACETS.map((f) => [f, []])) as unknown as Record<
		Facet,
		string[]
	>;
	return { facets: { ...empty, ...values, wordCount: 10_000 } };
}

function row(overrides: Partial<SmartShelf> = {}): SmartShelf {
	return {
		id: "s1",
		name: "Short reads",
		conditions: serializeTree(filterToTree({ tags: { in: ["short"], out: [] } })),
		pinned: false,
		sortOrder: 1,
		deleted: false,
		createdAt: 1,
		updatedAt: 1,
		...overrides,
	};
}

describe("smart shelves", () => {
	it("built-ins count reading, finished and finished-but-unrated books", () => {
		const shelves = builtInShelves(new Set());
		const items = [
			book({ status: ["reading"], rating: ["none"] }),
			book({ status: ["finished"], rating: ["none"] }),
			book({ status: ["finished"], rating: ["4"] }),
			book({ status: ["want"], rating: ["none"] }),
		];
		const counts = shelfCounts(shelves, items);
		expect(counts.get("builtin:reading")).toBe(1);
		expect(counts.get("builtin:finished")).toBe(2);
		expect(counts.get("builtin:unrated")).toBe(1);
	});

	it("a rating on a finished book moves it out of Unrated", () => {
		const shelves = builtInShelves(new Set());
		const before = [book({ status: ["finished"], rating: ["none"] })];
		const after = [book({ status: ["finished"], rating: ["5"] })];
		expect(shelfCounts(shelves, before).get("builtin:unrated")).toBe(1);
		expect(shelfCounts(shelves, after).get("builtin:unrated")).toBe(0);
	});

	it("a user shelf counts its matches; an unreadable one counts none", () => {
		const shelves = [shelfEntryOf(row()), shelfEntryOf(row({ id: "s2", conditions: "{" }))];
		const counts = shelfCounts(shelves, [book({ tags: ["short"] }), book({ tags: ["long"] })]);
		expect(counts.get("s1")).toBe(1);
		expect(counts.get("s2")).toBe(0);
		expect(shelves[1].tree).toBeNull();
		expect(shelves[1].filter).toBeNull();
	});

	it("orders pinned first, built-ins ahead of user shelves otherwise", () => {
		const shelves = orderShelves([
			shelfEntryOf(row({ id: "u1", name: "B", sortOrder: 2 })),
			shelfEntryOf(row({ id: "u2", name: "A", sortOrder: 1, pinned: true })),
			...builtInShelves(new Set(["builtin:finished"])),
		]);
		expect(shelves.map((s) => s.id)).toEqual([
			"builtin:finished",
			"u2",
			"builtin:reading",
			"builtin:unrated",
			"u1",
		]);
	});

	it("reads only built-in ids from the device's pins", () => {
		expect([...parseBuiltInPins(JSON.stringify(["builtin:reading", "u1", 3]))]).toEqual([
			"builtin:reading",
		]);
		expect(parseBuiltInPins("nope").size).toBe(0);
		expect(parseBuiltInPins(null).size).toBe(0);
		expect(isBuiltInShelfId("builtin:x")).toBe(true);
		expect(isBuiltInShelfId("abc")).toBe(false);
	});
});
