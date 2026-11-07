import { describe, expect, it } from "vitest";
import { makeBook } from "../../../test/book-fixture";
import { buildLibraryItems } from "../sort-filter";
import {
	type CellContext,
	columnsOf,
	DEFAULT_COLUMNS,
	headerSort,
	parseColumns,
	serializeColumns,
	TABLE_COLUMNS,
	toggleColumn,
} from "../table-columns";

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

	it("sorts a new header its natural way and flips the sorted one", () => {
		expect(headerSort({ sortBy: "recent", reversed: true }, "title")).toEqual({
			sortBy: "title",
			reversed: false,
		});
		expect(headerSort({ sortBy: "title", reversed: false }, "title")).toEqual({
			sortBy: "title",
			reversed: true,
		});
		expect(headerSort({ sortBy: "title", reversed: true }, "title")).toEqual({
			sortBy: "title",
			reversed: false,
		});
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
		);
		const ctx: CellContext = { ...shelves, highlightCounts: new Map([["b", 3]]) };
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
