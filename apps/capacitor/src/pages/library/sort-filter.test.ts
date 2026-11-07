import { type BookStatus, seriesCollectionId, wordPos } from "@lesefluss/core";
import { describe, expect, it } from "vitest";
import type { SeriesActivity } from "../../services/db/queries/series";
import type { Book, Series } from "../../services/db/schema";
import { makeBook } from "../../test/book-fixture";
import type { LibraryFilter } from "./filter-model";
import { facetOptions } from "./filter-picker";
import {
	applyLibraryView,
	buildLibraryItems,
	filterAndSortLibrary,
	isSortBy,
	SORT_OPTIONS,
	type SortBy,
	tagsInUse,
} from "./sort-filter";

type FilterBy = "all" | BookStatus;

function statusFilter(filterBy: FilterBy): LibraryFilter {
	return filterBy === "all" ? {} : { status: { in: [filterBy], out: [] } };
}

function makeSeries(overrides: Partial<Series> = {}): Series {
	return {
		id: "abc12345",
		title: "S",
		author: null,
		coverImage: null,
		description: null,
		sourceUrl: "https://example.test",
		tocUrl: "https://example.test/toc",
		provider: "ao3",
		lastCheckedAt: null,
		createdAt: 0,
		deleted: false,
		updatedAt: 0,
		...overrides,
	};
}

function visibleIds(books: Book[], filterBy: FilterBy, sortBy: SortBy = "recent"): string[] {
	return filterAndSortLibrary(books, [], new Map(), { filter: statusFilter(filterBy), sortBy }).map(
		(item) => (item.kind === "book" ? item.book.id : item.series.id),
	);
}

describe("filtering by derived status", () => {
	const unstarted = makeBook({ id: "aaaaaaaa", wordPosition: wordPos(0) });
	const partway = makeBook({ id: "bbbbbbbb", wordPosition: wordPos(500) });
	const atTheEnd = makeBook({ id: "cccccccc", wordPosition: wordPos(990) });
	const all = [unstarted, partway, atTheEnd];

	it("puts an untouched book on the want shelf", () => {
		expect(visibleIds(all, "want")).toEqual(["aaaaaaaa"]);
	});

	it("puts a partly read book on the reading shelf", () => {
		expect(visibleIds(all, "reading")).toEqual(["bbbbbbbb"]);
	});

	it("puts a book past the threshold on the finished shelf", () => {
		expect(visibleIds(all, "finished")).toEqual(["cccccccc"]);
	});

	it("shows everything under all", () => {
		expect(visibleIds(all, "all")).toHaveLength(3);
	});

	it("leaves the dropped shelf empty until someone says so", () => {
		expect(visibleIds(all, "dropped")).toEqual([]);
	});
});

describe("an explicit status outranks the reading position", () => {
	// The whole point of the column: reading on past the threshold does not
	// un-drop a book the reader gave up on.
	it("keeps a dropped book dropped after it is read to the end", () => {
		const dropped = makeBook({ id: "aaaaaaaa", wordPosition: wordPos(1000), status: "dropped" });
		expect(visibleIds([dropped], "dropped")).toEqual(["aaaaaaaa"]);
		expect(visibleIds([dropped], "finished")).toEqual([]);
	});

	it("honours a book marked finished before it was read", () => {
		const finished = makeBook({ id: "aaaaaaaa", wordPosition: wordPos(0), status: "finished" });
		expect(visibleIds([finished], "finished")).toEqual(["aaaaaaaa"]);
		expect(visibleIds([finished], "want")).toEqual([]);
	});

	it("falls back to derivation once the status is cleared", () => {
		const cleared = makeBook({ id: "aaaaaaaa", wordPosition: wordPos(500), status: null });
		expect(visibleIds([cleared], "reading")).toEqual(["aaaaaaaa"]);
	});
});

describe("series shelves", () => {
	function libraryWith(activity: SeriesActivity | undefined, filterBy: FilterBy) {
		const map = new Map<string, SeriesActivity>();
		if (activity) map.set("abc12345", activity);
		return filterAndSortLibrary([], [makeSeries()], map, {
			filter: statusFilter(filterBy),
			sortBy: "recent",
		});
	}

	it("treats a series with no chapters yet as want, not finished", () => {
		expect(libraryWith(undefined, "want")).toHaveLength(1);
		expect(libraryWith(undefined, "finished")).toHaveLength(0);
	});

	it("is reading once a chapter is started and some remain", () => {
		const activity = { total: 10, started: 3, finished: 2, latestRead: 5 } as SeriesActivity;
		expect(libraryWith(activity, "reading")).toHaveLength(1);
	});

	it("is finished once every chapter is", () => {
		const activity = { total: 10, started: 10, finished: 10, latestRead: 5 } as SeriesActivity;
		expect(libraryWith(activity, "finished")).toHaveLength(1);
	});

	it("never lands on the dropped shelf", () => {
		const activity = { total: 10, started: 3, finished: 2, latestRead: 5 } as SeriesActivity;
		expect(libraryWith(activity, "dropped")).toHaveLength(0);
	});
});

describe("the series facet with series collections", () => {
	const dune = seriesCollectionId("dune");
	const dune1 = makeBook({ id: "aaaaaaaa", seriesName: "Dune", seriesIndex: 1 });
	const dune2 = makeBook({ id: "bbbbbbbb", seriesName: "dune ", seriesIndex: 2 });
	const loose = makeBook({ id: "cccccccc", seriesName: "Dune" });
	const serial = makeSeries({ id: "abc12345", title: "A Serial" });
	const collectionsOf = new Map([
		["aaaaaaaa", [dune, "f00dcafe"]],
		["bbbbbbbb", [dune]],
		["cccccccc", ["f00dcafe"]],
	]);
	const collections = [
		{ id: dune, name: "Dune Saga" },
		{ id: "f00dcafe", name: "Favourites" },
	];
	const items = () =>
		buildLibraryItems([dune1, dune2, loose], [serial], new Map(), Date.now(), collectionsOf);

	it("lists series collections next to serials, named after the collection", () => {
		expect(facetOptions(items(), collections).series).toEqual([
			{ value: "abc12345", label: "A Serial", count: 1 },
			{ value: dune, label: "Dune Saga", count: 2 },
		]);
	});

	it("goes by membership, not by the book's series hint", () => {
		const shown = applyLibraryView(items(), {
			filter: { series: { in: [dune], out: [] } },
			sortBy: "title",
		}).map((item) => (item.kind === "book" ? item.book.id : item.series.id));
		expect(shown.sort()).toEqual(["aaaaaaaa", "bbbbbbbb"]);
	});
});

describe("sorting by recent and title", () => {
	const apple = makeBook({ id: "aaaaaaaa", title: "Apple Book", addedAt: 100 });
	const zebra = makeBook({ id: "bbbbbbbb", title: "Zebra Book", addedAt: 200 });
	const mango = makeBook({ id: "cccccccc", title: "Mango Book", addedAt: 50, lastRead: 300 });

	it("puts the newest import first under recent, a recent read ahead of both", () => {
		expect(visibleIds([apple, zebra], "all", "recent")).toEqual(["bbbbbbbb", "aaaaaaaa"]);
		expect(visibleIds([apple, zebra, mango], "all", "recent")).toEqual([
			"cccccccc",
			"bbbbbbbb",
			"aaaaaaaa",
		]);
	});

	it("orders A to Z under title", () => {
		expect(visibleIds([zebra, mango, apple], "all", "title")).toEqual([
			"aaaaaaaa",
			"cccccccc",
			"bbbbbbbb",
		]);
	});
});

describe("natural order and then-by", () => {
	const ids = (books: Book[], sortBy: SortBy, thenBy: SortBy | null = null) =>
		filterAndSortLibrary(books, [], new Map(), { filter: {}, sortBy, thenBy }).map((item) =>
			item.kind === "book" ? item.book.id : item.series.id,
		);

	it("puts Book 2 before Book 10, and ignores case", () => {
		const books = [
			makeBook({ id: "ten", title: "Book 10" }),
			makeBook({ id: "two", title: "book 2" }),
			makeBook({ id: "one", title: "Book 1" }),
		];
		expect(ids(books, "title")).toEqual(["one", "two", "ten"]);
	});

	it("breaks ties by the second key", () => {
		const books = [
			makeBook({ id: "b-low", author: "Banks", rating: 4 }),
			makeBook({ id: "a", author: "Asimov", rating: 2 }),
			makeBook({ id: "b-high", author: "banks", rating: 9 }),
		];
		expect(ids(books, "author", "rating")).toEqual(["a", "b-high", "b-low"]);
		expect(ids(books, "author", "author")).toEqual(ids(books, "author"));
	});
});

describe("sorting by rating", () => {
	it("ranks higher ratings first and puts unrated last", () => {
		const books = [
			makeBook({ id: "aaaaaaaa", rating: 3 }),
			makeBook({ id: "bbbbbbbb", rating: null }),
			makeBook({ id: "cccccccc", rating: 5 }),
		];
		expect(visibleIds(books, "all", "rating")).toEqual(["cccccccc", "aaaaaaaa", "bbbbbbbb"]);
	});
});

describe("search", () => {
	const books = [
		makeBook({ id: "aaaaaaaa", title: "The Hero of Ages", author: "Brandon Sanderson" }),
		makeBook({ id: "bbbbbbbb", title: "Red Rising", author: "Pierce Brown" }),
	];

	function searchIds(
		search: string,
		extra: Partial<Parameters<typeof filterAndSortLibrary>[3]> = {},
	) {
		return filterAndSortLibrary(books, [], new Map(), {
			filter: {},
			sortBy: "recent",
			search,
			...extra,
		}).map((item) => (item.kind === "book" ? item.book.id : item.series.id));
	}

	it("matches on title, case-insensitively", () => {
		expect(searchIds("hero")).toEqual(["aaaaaaaa"]);
		expect(searchIds("HERO")).toEqual(["aaaaaaaa"]);
	});

	it("matches on author", () => {
		expect(searchIds("pierce")).toEqual(["bbbbbbbb"]);
	});

	it("ignores surrounding whitespace and empty input", () => {
		expect(searchIds("  ")).toHaveLength(2);
		expect(searchIds("  rising  ")).toEqual(["bbbbbbbb"]);
	});

	it("finds series by title too", () => {
		const items = filterAndSortLibrary([], [makeSeries({ title: "Worm" })], new Map(), {
			filter: {},
			sortBy: "recent",
			search: "wor",
		});
		expect(items).toHaveLength(1);
	});

	// Search narrows what the shelf already selected rather than replacing it.
	it("composes with the status filter", () => {
		const dropped = makeBook({ id: "cccccccc", title: "Red Sky", status: "dropped" });
		const all = [...books, dropped];
		const ids = filterAndSortLibrary(all, [], new Map(), {
			filter: statusFilter("dropped"),
			sortBy: "recent",
			search: "red",
		}).map((item) => (item.kind === "book" ? item.book.id : item.series.id));
		expect(ids).toEqual(["cccccccc"]);
	});
});

describe("tag filtering", () => {
	const tagged = makeBook({ id: "aaaaaaaa", tags: '["scifi","reread"]' });
	const other = makeBook({ id: "bbbbbbbb", tags: '["poetry"]' });
	const untagged = makeBook({ id: "cccccccc", tags: null });
	const all = [tagged, other, untagged];

	function taggedIds(tag: string | null) {
		return filterAndSortLibrary(all, [], new Map(), {
			filter: tag ? { tags: { in: [tag], out: [] } } : {},
			sortBy: "recent",
		}).map((item) => (item.kind === "book" ? item.book.id : item.series.id));
	}

	it("keeps only books carrying the tag", () => {
		expect(taggedIds("scifi")).toEqual(["aaaaaaaa"]);
		expect(taggedIds("poetry")).toEqual(["bbbbbbbb"]);
	});

	it("shows everything when no tag is selected", () => {
		expect(taggedIds(null)).toHaveLength(3);
	});

	it("lists every tag in use, sorted, without duplicates", () => {
		expect(tagsInUse(all)).toEqual(["poetry", "reread", "scifi"]);
	});

	it("offers no tags for a library that has none", () => {
		expect(tagsInUse([untagged])).toEqual([]);
	});

	// Series have no tags, so a tag filter cannot match them.
	it("hides series while a tag is selected", () => {
		const items = filterAndSortLibrary(all, [makeSeries()], new Map(), {
			filter: { tags: { in: ["scifi"], out: [] } },
			sortBy: "recent",
		});
		expect(items.every((item) => item.kind === "book")).toBe(true);
	});
});

describe("time left", () => {
	// No speed model: the 225 wpm stand-in, so 13,500 words are exactly an hour.
	const HOUR_OF_WORDS = 13_500;
	const books = [
		makeBook({ id: "long0000", wordCount: 3 * HOUR_OF_WORDS }),
		makeBook({ id: "unknown0", wordCount: 0 }),
		makeBook({ id: "short000", wordCount: HOUR_OF_WORDS - 1 }),
		makeBook({
			id: "hour0000",
			wordCount: 2 * HOUR_OF_WORDS,
			wordPosition: wordPos(HOUR_OF_WORDS),
		}),
		makeBook({ id: "done0000", wordCount: 100, wordPosition: wordPos(100), finishedAt: 1 }),
	];
	const ids = (view: Parameters<typeof applyLibraryView>[1]) =>
		applyLibraryView(buildLibraryItems(books, [makeSeries()], new Map()), view).map((item) =>
			item.kind === "book" ? item.book.id : item.series.id,
		);

	it("sorts shortest left first, with unknown lengths, finished books and series last", () => {
		expect(ids({ filter: {}, sortBy: "timeLeft" }).slice(0, 3)).toEqual([
			"short000",
			"hour0000",
			"long0000",
		]);
	});

	it("keeps quick reads to under an hour left", () => {
		expect(ids({ filter: { timeLeft: { in: ["quick"], out: [] } }, sortBy: "timeLeft" })).toEqual([
			"short000",
		]);
	});

	it("times what is left at the speed model's pace", () => {
		const model = { pace: { wpm: 450, source: "measured" }, books: {} } as never;
		const [item] = buildLibraryItems([books[0]], [], new Map(), 0, new Map(), model);
		expect(item.sortKey.minutesLeft).toBe(90);
		expect(item.facets.timeLeft).toEqual([]);
	});
});

describe("isSortBy", () => {
	it("accepts every offered sort, so a stored choice survives a restart", () => {
		expect(SORT_OPTIONS.filter((option) => !isSortBy(option))).toEqual([]);
		expect(isSortBy("timeLeft")).toBe(true);
		expect(isSortBy("bogus")).toBe(false);
	});
});
