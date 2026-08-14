import { wordPos } from "@lesefluss/core";
import { describe, expect, it } from "vitest";
import type { SeriesActivity } from "../../services/db/queries/series";
import type { Book, Series } from "../../services/db/schema";
import { type FilterBy, filterAndSortLibrary, type SortBy, tagsInUse } from "./sort-filter";

function makeBook(overrides: Partial<Book> = {}): Book {
	return {
		id: "deadbeef",
		title: "T",
		author: null,
		fileFormat: "txt",
		filePath: null,
		size: 0,
		wordPosition: wordPos(0),
		wordCount: 1000,
		isActive: false,
		addedAt: 0,
		updatedAt: 0,
		metadataUpdatedAt: 0,
		lastRead: null,
		finishedAt: null,
		description: null,
		language: null,
		status: null,
		rating: null,
		review: null,
		tags: null,
		source: null,
		catalogId: null,
		sourceUrl: null,
		deleted: false,
		seriesId: null,
		chapterIndex: null,
		chapterSourceUrl: null,
		chapterStatus: "fetched",
		chapterError: null,
		...overrides,
	};
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
	return filterAndSortLibrary(books, [], new Map(), { filterBy, sortBy }).map((item) =>
		item.kind === "book" ? item.book.id : item.series.id,
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
		return filterAndSortLibrary([], [makeSeries()], map, { filterBy, sortBy: "recent" });
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
			filterBy: "all",
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
			filterBy: "all",
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
			filterBy: "dropped",
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
			filterBy: "all",
			sortBy: "recent",
			tag,
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
			filterBy: "all",
			sortBy: "recent",
			tag: "scifi",
		});
		expect(items.every((item) => item.kind === "book")).toBe(true);
	});
});
