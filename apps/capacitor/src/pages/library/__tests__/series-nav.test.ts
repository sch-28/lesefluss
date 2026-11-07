import { wordPos } from "@lesefluss/core";
import { describe, expect, it } from "vitest";
import { indexBeside } from "../../../components/collections/collection-actions";
import type { CollectionWithCount } from "../../../services/db/queries/collections";
import type { Series } from "../../../services/db/schema";
import { makeBook } from "../../../test/book-fixture";
import {
	buildSeriesEntries,
	countLabel,
	filterSeriesEntries,
	progressLabel,
	type SeriesSources,
	seriesSummary,
} from "../series-nav";

function collection(over: Partial<CollectionWithCount>): CollectionWithCount {
	return {
		id: "c",
		name: "C",
		sortOrder: 1,
		ordered: true,
		seriesKey: "c",
		view: null,
		deleted: false,
		createdAt: 1,
		updatedAt: 1,
		bookCount: 1,
		...over,
	};
}

function serial(over: Partial<Series>): Series {
	return { id: "s", title: "S", author: null, coverImage: null, ...over } as Series;
}

function sources(over: Partial<SeriesSources>): SeriesSources {
	return {
		collections: [],
		seriesMemberships: new Map(),
		books: [],
		serials: [],
		chapterCounts: new Map(),
		serialActivity: new Map(),
		...over,
	};
}

describe("buildSeriesEntries", () => {
	it("lists book series and serials, hides empty ones and plain collections", () => {
		const entries = buildSeriesEntries(
			sources({
				collections: [
					collection({ id: "dune", name: "Dune", bookCount: 3 }),
					collection({ id: "empty", name: "Empty", bookCount: 0 }),
					collection({ id: "fav", name: "Favourites", seriesKey: null, ordered: false }),
				],
				serials: [serial({ id: "wn", title: "Worm" }), serial({ id: "new", title: "Fresh" })],
				chapterCounts: new Map([["wn", 304]]),
			}),
		);
		expect(entries.map((e) => [e.kind, e.name, e.count])).toEqual([
			["book", "Dune", 3],
			["serial", "Worm", 304],
		]);
	});

	it("orders by last read, unread series last by name", () => {
		const books = [
			makeBook({ id: "a", lastRead: 100, author: "Herbert" }),
			makeBook({ id: "b", lastRead: 300, author: "Herbert", wordPosition: wordPos(1000) }),
		];
		const entries = buildSeriesEntries(
			sources({
				collections: [
					collection({ id: "dune", name: "Dune", bookCount: 2 }),
					collection({ id: "zed", name: "Zed" }),
					collection({ id: "alpha", name: "Alpha" }),
				],
				books,
				seriesMemberships: new Map([
					["a", [{ collectionId: "dune", seriesIndex: 2 }]],
					["b", [{ collectionId: "dune", seriesIndex: 1 }]],
				]),
				serials: [serial({ id: "wn", title: "Worm", author: "Wildbow" })],
				chapterCounts: new Map([["wn", 10]]),
				serialActivity: new Map([["wn", { total: 10, started: 2, finished: 1, latestRead: 200 }]]),
			}),
		);
		expect(entries.map((e) => e.name)).toEqual(["Dune", "Worm", "Alpha", "Zed"]);
		const dune = entries[0];
		expect(dune?.lastRead).toBe(300);
		expect(dune?.author).toBe("Herbert");
		expect(dune?.coverBookIds).toEqual(["b", "a"]);
		expect(dune?.finished).toBe(1);
		expect(entries[1]?.finished).toBe(1);
	});
});

describe("filterSeriesEntries", () => {
	const entries = buildSeriesEntries(
		sources({
			collections: [
				collection({ id: "dune", name: "Dune", bookCount: 6 }),
				collection({ id: "earth", name: "Earthsea", bookCount: 2 }),
			],
			serials: [serial({ id: "wn", title: "Wandering Inn" })],
			chapterCounts: new Map([["wn", 40]]),
		}),
	);

	it("matches the name case-insensitively", () => {
		expect(
			filterSeriesEntries(entries, { query: " EARTH", kind: "all", sort: "name" }).map((e) => e.id),
		).toEqual(["earth"]);
	});

	it("filters by kind and sorts by size or name", () => {
		expect(
			filterSeriesEntries(entries, { query: "", kind: "book", sort: "size" }).map((e) => e.id),
		).toEqual(["dune", "earth"]);
		expect(
			filterSeriesEntries(entries, { query: "", kind: "all", sort: "name" }).map((e) => e.id),
		).toEqual(["dune", "earth", "wn"]);
		expect(
			filterSeriesEntries(entries, { query: "", kind: "serial", sort: "name" }).map((e) => e.id),
		).toEqual(["wn"]);
	});
});

describe("labels", () => {
	it("names books for book series and chapters for serials", () => {
		expect(countLabel({ kind: "book", count: 1 })).toBe("1 book");
		expect(countLabel({ kind: "serial", count: 12 })).toBe("12 chapters");
		expect(progressLabel({ started: 0, finished: 0 })).toBe("New");
		expect(progressLabel({ started: 2, finished: 0 })).toBe("2 started");
		expect(progressLabel({ started: 3, finished: 3 })).toBe("3 finished");
		expect(seriesSummary([{ kind: "book" }, { kind: "book" }, { kind: "serial" }])).toBe(
			"3 · 2 book series, 1 serial",
		);
		expect(seriesSummary([])).toBe("No series yet");
	});
});

describe("indexBeside", () => {
	const all = ["a", "s1", "b", "s2", "c"].map((id) => collection({ id }));

	it("indexes into the full list when hidden series sit between visible collections", () => {
		expect(indexBeside(all, "c", "b", "before")).toBe(2);
		expect(indexBeside(all, "a", "b", "after")).toBe(2);
		expect(indexBeside(all, "a", "c", "after")).toBe(4);
	});
});
