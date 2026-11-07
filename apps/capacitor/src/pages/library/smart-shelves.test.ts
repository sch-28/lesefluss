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
	withBuiltInPin,
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

	it("pins every built-in on a device with no stored choice", () => {
		const all = ["builtin:reading", "builtin:finished", "builtin:unrated"];
		expect([...parseBuiltInPins(null)]).toEqual(all);
		expect([...parseBuiltInPins("nope")]).toEqual(all);
		expect(builtInShelves(parseBuiltInPins(null)).every((s) => s.pinned)).toBe(true);
	});

	it("keeps an explicit unpin and defaults only the built-ins never chosen", () => {
		const unpinned = withBuiltInPin(null, "builtin:finished", false);
		expect([...parseBuiltInPins(unpinned)]).toEqual(["builtin:reading", "builtin:unrated"]);
		const repinned = withBuiltInPin(unpinned, "builtin:finished", true);
		expect(parseBuiltInPins(repinned).has("builtin:finished")).toBe(true);
		expect(withBuiltInPin(null, "u1", false)).toBe("{}");
		expect(parseBuiltInPins(JSON.stringify({ "builtin:reading": "no", u1: false })).size).toBe(3);
	});

	it("reads the first format's pinned-id list as a choice for every built-in", () => {
		expect([...parseBuiltInPins(JSON.stringify(["builtin:reading", "u1", 3]))]).toEqual([
			"builtin:reading",
		]);
		expect(parseBuiltInPins("[]").size).toBe(0);
		expect(isBuiltInShelfId("builtin:x")).toBe(true);
		expect(isBuiltInShelfId("abc")).toBe(false);
	});

	it("lists every shelf with the pinned ones first, unpinned built-ins included", () => {
		const pins = parseBuiltInPins(withBuiltInPin(null, "builtin:reading", false));
		const shelves = orderShelves([
			shelfEntryOf(row({ id: "u1", sortOrder: 1 })),
			shelfEntryOf(row({ id: "u2", sortOrder: 2, pinned: true })),
			...builtInShelves(pins),
		]);
		expect(shelves.map((s) => [s.id, s.pinned])).toEqual([
			["builtin:finished", true],
			["builtin:unrated", true],
			["u2", true],
			["builtin:reading", false],
			["u1", false],
		]);
	});
});
