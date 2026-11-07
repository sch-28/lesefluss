import { seriesCollectionId } from "@lesefluss/core";
import { describe, expect, it } from "vitest";
import type { Book } from "../../../services/db/schema";
import { makeBook } from "../../../test/book-fixture";
import {
	displayOrder,
	type GroupContext,
	groupLibrary,
	layoutRows,
	parseCollapsed,
	seriesBadge,
	toggleCollapsed,
} from "../group-by";
import { applyLibraryView, buildLibraryItems, type LibraryItem } from "../sort-filter";

const dune = seriesCollectionId("dune");
const expanse = seriesCollectionId("the expanse");
const plain = "c-plain";

const ctx: GroupContext = {
	collections: [
		{ id: plain, name: "Favourites" },
		{ id: expanse, name: "The Expanse" },
		{ id: dune, name: "Dune" },
	],
	seriesMemberships: new Map([
		["messiah", [{ collectionId: dune, seriesIndex: 2 }]],
		["dune1", [{ collectionId: dune, seriesIndex: 1 }]],
		["loose", [{ collectionId: dune, seriesIndex: null }]],
		[
			"crossover",
			[
				{ collectionId: expanse, seriesIndex: null },
				{ collectionId: dune, seriesIndex: 2.5 },
			],
		],
	]),
};

const collectionsOf = new Map([
	["messiah", [dune]],
	["dune1", [dune, plain]],
	["loose", [dune]],
	["crossover", [expanse, dune]],
]);

function items(books: Book[]): LibraryItem[] {
	return applyLibraryView(buildLibraryItems(books, [], new Map(), 0, collectionsOf), {
		filter: {},
		sortBy: "title",
	});
}

const ids = (list: readonly LibraryItem[]) =>
	list.map((i) => (i.kind === "book" ? i.book.id : i.series.id));
const shape = (groups: ReturnType<typeof groupLibrary>) =>
	(groups ?? []).map((g) => [g.label, ids(g.items)]);

const library = items([
	makeBook({ id: "messiah", title: "Dune Messiah", author: "Herbert", tags: '["sf"]' }),
	makeBook({ id: "dune1", title: "Dune", author: "Herbert", tags: '["sf","classic"]' }),
	makeBook({ id: "loose", title: "Arrakis notes", author: "herbert" }),
	makeBook({ id: "crossover", title: "Zeta", author: "Abraham", status: "finished" }),
	makeBook({ id: "solo", title: "Middle", author: null }),
]);

describe("groupLibrary", () => {
	it("groups nothing for none", () => {
		expect(groupLibrary(library, "none", ctx)).toBeNull();
	});

	it("groups by series collection, by #N inside, and shows a book in two series in both", () => {
		expect(shape(groupLibrary(library, "series", ctx))).toEqual([
			["Dune", ["dune1", "messiah", "crossover", "loose"]],
			["The Expanse", ["crossover"]],
			["No series", ["solo"]],
		]);
	});

	it("leaves a plain collection out of the series grouping", () => {
		const groups = groupLibrary(library, "series", ctx) ?? [];
		expect(groups.map((g) => g.key)).not.toContain(plain);
	});

	it("orders collections as the sidebar does, the books outside last", () => {
		expect(shape(groupLibrary(library, "collection", ctx))).toEqual([
			["Favourites", ["dune1"]],
			["The Expanse", ["crossover"]],
			["Dune", ["loose", "dune1", "messiah", "crossover"]],
			["Not in a collection", ["solo"]],
		]);
	});

	it("groups an author however it is cased, in the view's order, the unknown author last", () => {
		expect(shape(groupLibrary(library, "author", ctx))).toEqual([
			["Abraham", ["crossover"]],
			["herbert", ["loose", "dune1", "messiah"]],
			["Unknown author", ["solo"]],
		]);
	});

	it("shows a book under each of its tags", () => {
		expect(shape(groupLibrary(library, "tag", ctx))).toEqual([
			["classic", ["dune1"]],
			["sf", ["dune1", "messiah"]],
			["No tags", ["loose", "solo", "crossover"]],
		]);
	});

	it("groups by status in the shelf order", () => {
		expect(shape(groupLibrary(library, "status", ctx))).toEqual([
			["Want to read", ["loose", "dune1", "messiah", "solo"]],
			["Finished", ["crossover"]],
		]);
	});
});

describe("seriesBadge", () => {
	it("takes the #N of the book's first series collection in sidebar order", () => {
		expect(seriesBadge("messiah", ctx.seriesMemberships)).toBe(2);
		const dunesFirst = new Map([
			[
				"crossover",
				[
					{ collectionId: dune, seriesIndex: 2.5 },
					{ collectionId: expanse, seriesIndex: 7 },
				],
			],
		]);
		expect(seriesBadge("crossover", dunesFirst)).toBe(2.5);
	});

	it("shows no badge when the first series collection leaves the book unnumbered", () => {
		expect(seriesBadge("crossover", ctx.seriesMemberships)).toBeNull();
	});

	it("shows no badge for an unnumbered member or a book outside any series", () => {
		expect(seriesBadge("loose", ctx.seriesMemberships)).toBeNull();
		expect(seriesBadge("solo", ctx.seriesMemberships)).toBeNull();
	});
});

describe("layoutRows", () => {
	const groups = groupLibrary(library, "series", ctx);

	it("chunks every group on its own rows under a heading", () => {
		const rows = layoutRows(library, groups, 3, new Set());
		expect(
			rows.map((r) => (r.type === "header" ? `# ${r.group.label}` : ids(r.items).join())),
		).toEqual([
			"# Dune",
			"dune1,messiah,crossover",
			"loose",
			"# The Expanse",
			"crossover",
			"# No series",
			"solo",
		]);
	});

	it("keeps a book's row key unique when it shows in two groups", () => {
		const rows = layoutRows(library, groups, 1, new Set());
		const keys = rows.flatMap((r) => (r.type === "items" ? [r.key] : []));
		expect(new Set(keys).size).toBe(keys.length);
	});

	it("keeps only the heading of a collapsed group", () => {
		const rows = layoutRows(library, groups, 3, new Set([dune]));
		expect(rows[0]).toMatchObject({ type: "header", collapsed: true });
		expect(rows[1]).toMatchObject({ type: "header", group: { label: "The Expanse" } });
	});

	it("lays out the plain list when nothing is grouped", () => {
		expect(layoutRows(library, null, 2, new Set()).map((r) => r.type)).toEqual([
			"items",
			"items",
			"items",
		]);
	});
});

describe("displayOrder", () => {
	const groups = groupLibrary(library, "series", ctx);

	it("follows the groups on screen, a book in two groups once", () => {
		expect(ids(displayOrder(library, groups, new Set()))).toEqual([
			"dune1",
			"messiah",
			"crossover",
			"loose",
			"solo",
		]);
	});

	it("puts the books of collapsed groups after every shown one", () => {
		expect(ids(displayOrder(library, groups, new Set([dune])))).toEqual([
			"crossover",
			"solo",
			"dune1",
			"messiah",
			"loose",
		]);
	});

	it("keeps the view's order when nothing is grouped", () => {
		expect(displayOrder(library, null, new Set())).toBe(library);
	});
});

describe("a large library", () => {
	it("groups and lays out 2500 books well inside a frame budget", () => {
		const many = items(
			Array.from({ length: 2500 }, (_, i) =>
				makeBook({ id: `b${i}`, title: `Book ${i}`, author: `Author ${i % 300}` }),
			),
		);
		const start = performance.now();
		const groups = groupLibrary(many, "author", ctx);
		layoutRows(many, groups, 6, new Set());
		displayOrder(many, groups, new Set());
		expect(performance.now() - start).toBeLessThan(50);
	});
});

describe("collapsed groups", () => {
	it("toggles a key in and out", () => {
		const once = toggleCollapsed("[]", "a");
		expect([...parseCollapsed(once)]).toEqual(["a"]);
		expect([...parseCollapsed(toggleCollapsed(once, "a"))]).toEqual([]);
	});

	it("reads a broken value as nothing collapsed", () => {
		expect(parseCollapsed("not json").size).toBe(0);
		expect(parseCollapsed('{"a":1}').size).toBe(0);
	});
});
