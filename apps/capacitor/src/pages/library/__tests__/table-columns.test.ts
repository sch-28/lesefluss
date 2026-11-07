import { describe, expect, it } from "vitest";
import { makeBook } from "../../../test/book-fixture";
import { buildLibraryItems, type SortBy, type SortState } from "../sort-filter";
import {
	type CellContext,
	columnsOf,
	DEFAULT_COLUMNS,
	headerSort,
	moveColumn,
	parseColumns,
	serializeColumns,
	TABLE_COLUMNS,
	toggleColumn,
} from "../table-columns";

const one = (sortBy: SortBy, reversed = false): SortState => ({
	sortBy,
	reversed,
	thenBy: null,
	thenReversed: false,
});

describe("table columns", () => {
	it("restores the stored columns, dropping unknown and repeated ids, title always first", () => {
		expect(parseColumns(serializeColumns(["title", "rating", "words"]))).toEqual([
			"title",
			"rating",
			"words",
		]);
		expect(parseColumns('["words","nope","words","title"]')).toEqual(["title", "words"]);
		expect(parseColumns(null)).toEqual(DEFAULT_COLUMNS);
		expect(parseColumns("{broken")).toEqual(DEFAULT_COLUMNS);
		expect(parseColumns('"title"')).toEqual(DEFAULT_COLUMNS);
	});

	it("shows a column last and hides it again, but never hides title", () => {
		const shown = toggleColumn(["title", "author"], "highlights");
		expect(shown).toEqual(["title", "author", "highlights"]);
		expect(toggleColumn(shown, "author")).toEqual(["title", "highlights"]);
		expect(toggleColumn(shown, "title")).toEqual(shown);
	});

	it("makes the Highlights header sort by highlight count", () => {
		expect(columnsOf(["highlights"]).map((c) => c.sortBy)).toEqual(["highlights"]);
		expect(headerSort(one("title"), "highlights")).toEqual(one("highlights"));
	});

	it("sorts a new header its natural way and flips the sorted one", () => {
		expect(headerSort(one("recent", true), "title")).toEqual(one("title"));
		expect(headerSort(one("title"), "title")).toEqual(one("title", true));
		expect(headerSort(one("title", true), "title")).toEqual(one("title"));
	});

	it("adds a second sort on Shift-click, flips either on Shift, and drops it on a plain click", () => {
		const two = headerSort(one("author"), "title", true);
		expect(two).toEqual({
			sortBy: "author",
			reversed: false,
			thenBy: "title",
			thenReversed: false,
		});
		expect(headerSort(two, "title", true)).toEqual({ ...two, thenReversed: true });
		expect(headerSort(two, "author", true)).toEqual({ ...two, reversed: true });
		expect(headerSort(two, "words", true)).toEqual({ ...two, thenBy: "words" });
		expect(headerSort(two, "title")).toEqual(one("title"));
		expect(headerSort(two, "author")).toEqual(one("author", true));
	});

	it("moves a column before an index, keeping title first", () => {
		const ids = ["title", "author", "series", "status"] as const;
		expect(moveColumn(ids, "status", 1)).toEqual(["title", "status", "author", "series"]);
		expect(moveColumn(ids, "author", 4)).toEqual(["title", "series", "status", "author"]);
		expect(moveColumn(ids, "author", 0)).toEqual([...ids]);
		expect(moveColumn(ids, "title", 3)).toEqual([...ids]);
	});

	it("fills each cell from the book and the collections it is in", () => {
		const book = makeBook({
			id: "b",
			title: "Dune",
			author: "Herbert",
			wordCount: 1200,
			rating: 7,
		});
		const shelves = {
			seriesMemberships: new Map([["b", [{ collectionId: "s", seriesIndex: 2 }]]]),
			collections: new Map([
				["s", { name: "Dune saga", seriesKey: "dune" }],
				["c", { name: "Classics", seriesKey: null }],
			]),
		};
		const [item] = buildLibraryItems(
			[book],
			[],
			new Map(),
			0,
			new Map([["b", ["s", "c"]]]),
			undefined,
			shelves,
			new Map([["b", 3]]),
		);
		const ctx: CellContext = shelves;
		const cells = Object.fromEntries(
			columnsOf(TABLE_COLUMNS.map((c) => c.id)).map((c) => [c.id, c.text(item, ctx)]),
		);
		expect(cells).toMatchObject({
			title: "Dune",
			author: "Herbert",
			series: "Dune saga #2",
			collections: "Classics",
			rating: "3.5 ★",
			words: (1200).toLocaleString(),
			highlights: "3",
			status: "Want to read",
		});
		expect(columnsOf(["title"]).map((c) => c.id)).toEqual(["title"]);
	});
});
