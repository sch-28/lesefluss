import { describe, expect, it } from "vitest";
import { makeBook } from "../../../test/book-fixture";
import {
	activeFilterCount,
	chipsOf,
	cycleValue,
	decodeFilterParam,
	encodeFilterParam,
	type FacetValues,
	FILTER_PARAM_MAX,
	FILTER_STORAGE_KEY,
	facetValuesOf,
	type LibraryFilter,
	loadFilter,
	matchesFilter,
	parseFilter,
	pruneFilter,
	removeValue,
	serializeFilter,
	setTagsMode,
	setWordRange,
	valueState,
	wordRangeLabel,
} from "../filter-model";
import { filterAndSortLibrary } from "../sort-filter";

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;

function values(overrides: Partial<FacetValues> = {}): FacetValues {
	return {
		status: ["reading"],
		tags: [],
		author: [],
		series: [],
		collection: [],
		rating: ["none"],
		progress: ["1-49"],
		timeLeft: [],
		added: [],
		lastRead: ["never"],
		wordCount: null,
		raw: { title: "", author: "", rating: null, progress: 0, addedAt: 0, lastRead: null },
		...overrides,
	};
}

const sel = (included: string[], out: string[] = []) => ({ in: included, out });

describe("matchesFilter", () => {
	it("matches everything without a filter", () => {
		expect(matchesFilter(values(), {})).toBe(true);
	});

	it("ORs the included values of one facet", () => {
		const filter: LibraryFilter = { tags: sel(["scifi", "poetry"]) };
		expect(matchesFilter(values({ tags: ["poetry"] }), filter)).toBe(true);
		expect(matchesFilter(values({ tags: ["history"] }), filter)).toBe(false);
	});

	it("ANDs different facets", () => {
		const filter: LibraryFilter = { tags: sel(["scifi"]), status: sel(["finished"]) };
		expect(matchesFilter(values({ tags: ["scifi"], status: ["finished"] }), filter)).toBe(true);
		expect(matchesFilter(values({ tags: ["scifi"], status: ["reading"] }), filter)).toBe(false);
	});

	it("always removes a book carrying an excluded value", () => {
		const filter: LibraryFilter = { tags: sel(["scifi"], ["dnf"]) };
		expect(matchesFilter(values({ tags: ["scifi", "dnf"] }), filter)).toBe(false);
		expect(matchesFilter(values({ tags: ["history"] }), { tags: sel([], ["dnf"]) })).toBe(true);
	});
});

describe("tags match all", () => {
	const all: LibraryFilter = { tags: { in: ["scifi", "space"], out: ["dnf"], mode: "all" } };

	it("keeps only books carrying every included tag", () => {
		expect(matchesFilter(values({ tags: ["scifi", "space", "x"] }), all)).toBe(true);
		expect(matchesFilter(values({ tags: ["scifi"] }), all)).toBe(false);
	});

	it("still removes a book carrying an excluded tag", () => {
		expect(matchesFilter(values({ tags: ["scifi", "space", "dnf"] }), all)).toBe(false);
	});

	it("switches back to any, and a filter rebuilt after clearing starts on any", () => {
		const any = setTagsMode(all, "any");
		expect(any.tags?.mode).toBeUndefined();
		expect(matchesFilter(values({ tags: ["scifi"] }), any)).toBe(true);
		let cleared = removeValue(all, "tags", "scifi");
		cleared = removeValue(cleared, "tags", "space");
		cleared = removeValue(cleared, "tags", "dnf");
		expect(cleared).toEqual({});
		expect(cycleValue(cleared, "tags", "scifi").tags?.mode).toBeUndefined();
	});

	it("resets to any once no included tag is left, even with excluded tags kept", () => {
		const oneLeft = removeValue(all, "tags", "scifi");
		expect(oneLeft.tags?.mode).toBe("all");
		const onlyExcluded = removeValue(oneLeft, "tags", "space");
		expect(onlyExcluded.tags).toEqual({ in: [], out: ["dnf"] });
		expect(cycleValue(onlyExcluded, "tags", "poetry").tags?.mode).toBeUndefined();
	});

	it("keeps the mode while other tags are cycled", () => {
		expect(cycleValue(all, "tags", "poetry").tags?.mode).toBe("all");
	});
});

describe("collection facet", () => {
	it("ORs included collections and removes excluded ones", () => {
		const filter: LibraryFilter = { collection: sel(["c1", "c2"], ["c3"]) };
		expect(matchesFilter(values({ collection: ["c2"] }), filter)).toBe(true);
		expect(matchesFilter(values({ collection: [] }), filter)).toBe(false);
		expect(matchesFilter(values({ collection: ["c1", "c3"] }), filter)).toBe(false);
	});

	it("reads a book's collections from the membership map", () => {
		const a = makeBook({ id: "aaaaaaaa" });
		const b = makeBook({ id: "bbbbbbbb" });
		const ids = filterAndSortLibrary(
			[a, b],
			[],
			new Map(),
			{ filter: { collection: sel(["c1"]) }, sortBy: "title" },
			NOW,
			new Map([["bbbbbbbb", ["c1"]]]),
		).map((it) => (it.kind === "book" ? it.book.id : it.series.id));
		expect(ids).toEqual(["bbbbbbbb"]);
	});

	it("drops a deleted collection from the filter", () => {
		const filter: LibraryFilter = { collection: sel(["live"], ["gone"]) };
		expect(pruneFilter(filter, "collection", new Set(["live"]))).toEqual({
			collection: sel(["live"]),
		});
	});
});

describe("length facet", () => {
	it("keeps books inside the range and drops books without a word count", () => {
		const filter: LibraryFilter = { words: { min: 100_000, max: 200_000 } };
		expect(matchesFilter(values({ wordCount: 150_000 }), filter)).toBe(true);
		expect(matchesFilter(values({ wordCount: 200_000 }), filter)).toBe(true);
		expect(matchesFilter(values({ wordCount: 99_999 }), filter)).toBe(false);
		expect(matchesFilter(values({ wordCount: null }), filter)).toBe(false);
		expect(matchesFilter(values({ wordCount: null }), { words: { max: 50_000 } })).toBe(false);
	});

	it("treats a book with a zero word count as unknown", () => {
		const book = makeBook({ id: "aaaaaaaa", wordCount: 0 });
		const count = (filter: LibraryFilter) =>
			filterAndSortLibrary([book], [], new Map(), { filter, sortBy: "recent" }, NOW).length;
		expect(count({ words: { max: 50_000 } })).toBe(0);
		expect(count({})).toBe(1);
	});

	it("labels the range compactly and counts as one active filter", () => {
		expect(wordRangeLabel({ min: 150_000 })).toBe("150k+");
		expect(wordRangeLabel({ max: 50_000 })).toBe("< 50k");
		expect(wordRangeLabel({ min: 50_000, max: 1_200_000 })).toBe("50k–1.2M");
		expect(activeFilterCount({ words: { min: 1 }, tags: sel(["a"]) })).toBe(2);
	});

	it("orders swapped bounds and clears an empty range", () => {
		expect(setWordRange({}, { min: 200, max: 100 }).words).toEqual({ min: 100, max: 200 });
		expect(setWordRange({ words: { min: 1 } }, { min: undefined })).toEqual({});
	});
});

describe("filter in the URL", () => {
	it("round-trips every facet, the tags mode and the range, unicode included", () => {
		const filter: LibraryFilter = {
			tags: { in: ["Märchen", "📚"], out: ["dnf"], mode: "all" },
			collection: sel(["c1"]),
			words: { min: 150_000 },
		};
		const param = encodeFilterParam(filter);
		expect(param).toMatch(/^[A-Za-z0-9_-]+$/);
		expect(decodeFilterParam(param)).toEqual(filter);
	});

	it("leaves an empty filter out of the URL", () => {
		expect(encodeFilterParam({})).toBeUndefined();
		expect(decodeFilterParam(undefined)).toBeNull();
	});

	it("drops broken parts and keeps the rest", () => {
		const raw = JSON.stringify({
			v: 1,
			facets: {
				tags: { in: ["a"], out: [], mode: "most" },
				collection: { in: ["c1"], out: 7 },
				words: { min: "lots" },
				mood: { in: ["x"], out: [] },
			},
		});
		const param = btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
		expect(decodeFilterParam(param)).toEqual({ tags: sel(["a"]), collection: sel(["c1"]) });
		expect(
			decodeFilterParam(
				btoa(JSON.stringify({ v: 1, facets: { words: { min: 9, max: 3 } } })).replace(/=+$/, ""),
			),
		).toEqual({});
	});

	it("returns null for a param that is not a filter at all", () => {
		expect(decodeFilterParam("%%%")).toBeNull();
		expect(decodeFilterParam("bm90IGpzb24")).toBeNull();
	});

	it("ignores a param too long to be a real filter, and still encodes a large stored one", () => {
		const tags = Array.from({ length: 20_000 }, (_, i) => `tag-${i}`);
		const param = encodeFilterParam({ tags: sel(tags) });
		expect(param?.length).toBeGreaterThan(FILTER_PARAM_MAX);
		expect(decodeFilterParam(param)).toBeNull();
	});
});

describe("facetValuesOf", () => {
	it("puts dates into every window that contains them", () => {
		const v = facetValuesOf(
			{
				title: "",
				status: "reading",
				tags: [],
				author: "",
				seriesId: null,
				collectionIds: [],
				wordCount: 0,
				rating: null,
				progress: 0,
				addedAt: NOW - 20 * DAY,
				lastRead: null,
			},
			NOW,
		);
		expect(v.added).toEqual(["30d", "90d", "365d"]);
		expect(v.lastRead).toEqual(["never"]);
		expect(v.rating).toEqual(["none"]);
		expect(v.progress).toEqual(["0"]);
	});

	it("files half-star ratings under whole stars", () => {
		const rating = (r: number | null) =>
			facetValuesOf(
				{
					title: "",
					status: "finished",
					tags: [],
					author: "",
					seriesId: null,
					collectionIds: [],
					wordCount: 0,
					rating: r,
					progress: 100,
					addedAt: NOW,
					lastRead: NOW,
				},
				NOW,
			).rating;
		expect(rating(10)).toEqual(["5"]);
		expect(rating(7)).toEqual(["4"]);
		expect(rating(1)).toEqual(["1"]);
		expect(rating(null)).toEqual(["none"]);
	});

	it("keeps a book read last week under Last 30 days but out of an excluded Last 7 days", () => {
		const book = makeBook({ id: "aaaaaaaa", lastRead: NOW - 3 * DAY });
		const ids = (filter: LibraryFilter) =>
			filterAndSortLibrary([book], [], new Map(), { filter, sortBy: "recent" }, NOW).length;
		expect(ids({ lastRead: sel(["30d"]) })).toBe(1);
		expect(ids({ lastRead: sel([], ["7d"]) })).toBe(0);
		expect(ids({ lastRead: sel(["never"]) })).toBe(0);
	});
});

describe("cycling and chips", () => {
	it("cycles a value through include, exclude and off", () => {
		let filter: LibraryFilter = {};
		filter = cycleValue(filter, "tags", "dnf");
		expect(valueState(filter, "tags", "dnf")).toBe("in");
		filter = cycleValue(filter, "tags", "dnf");
		expect(valueState(filter, "tags", "dnf")).toBe("out");
		filter = cycleValue(filter, "tags", "dnf");
		expect(valueState(filter, "tags", "dnf")).toBe("off");
		expect(filter).toEqual({});
	});

	it("shows one chip per active value, excluded ones marked", () => {
		const filter: LibraryFilter = { status: sel(["reading"]), tags: sel(["scifi"], ["dnf"]) };
		expect(chipsOf(filter)).toEqual([
			{ facet: "status", value: "reading", isExcluded: false },
			{ facet: "tags", value: "scifi", isExcluded: false },
			{ facet: "tags", value: "dnf", isExcluded: true },
		]);
		expect(chipsOf(removeValue(filter, "tags", "dnf"))).toHaveLength(2);
	});

	it("prunes values no book carries any more", () => {
		const filter: LibraryFilter = { tags: sel(["gone", "kept"]) };
		expect(pruneFilter(filter, "tags", new Set(["kept"]))).toEqual({ tags: sel(["kept"]) });
		expect(pruneFilter(filter, "tags", new Set())).toEqual({});
	});
});

describe("persistence", () => {
	const storage = (entries: Record<string, string>) => ({
		getItem: (key: string) => entries[key] ?? null,
	});

	it("round-trips through the v2 key", () => {
		const filter: LibraryFilter = { tags: sel(["a"], ["b"]), rating: sel(["5"]) };
		expect(loadFilter(storage({ [FILTER_STORAGE_KEY]: serializeFilter(filter) }))).toEqual(filter);
	});

	it("migrates the old status and tag keys", () => {
		expect(
			loadFilter(
				storage({ "lesefluss:library-filter": "finished", "lesefluss:library-tag": "scifi" }),
			),
		).toEqual({ status: sel(["finished"]), tags: sel(["scifi"]) });
		expect(loadFilter(storage({ "lesefluss:library-filter": "all" }))).toEqual({});
	});

	it("prefers the v2 key over the old ones", () => {
		expect(
			loadFilter(
				storage({
					[FILTER_STORAGE_KEY]: serializeFilter({}),
					"lesefluss:library-tag": "scifi",
				}),
			),
		).toEqual({});
	});

	it("drops unknown facets and malformed values", () => {
		const raw = JSON.stringify({
			v: 1,
			facets: { tags: { in: ["a", 3], out: "x" }, mood: { in: ["happy"], out: [] } },
		});
		expect(parseFilter(raw)).toEqual({ tags: sel(["a"]) });
		expect(parseFilter("{not json")).toBeNull();
		expect(parseFilter(JSON.stringify({ v: 2, facets: {} }))).toBeNull();
	});
});

describe("a large library", () => {
	it("filters 2000 books by included and excluded tags", () => {
		const books = Array.from({ length: 2000 }, (_, i) =>
			makeBook({
				id: `b${String(i).padStart(7, "0")}`,
				title: `Book ${i}`,
				tags: JSON.stringify([`t${i % 20}`, `u${i % 7}`]),
			}),
		);
		const items = filterAndSortLibrary(books, [], new Map(), {
			filter: { tags: sel(["t1", "t2"], ["u3"]) },
			sortBy: "title",
		});
		const expected = Array.from({ length: 2000 }, (_, i) => i).filter(
			(i) => (i % 20 === 1 || i % 20 === 2) && i % 7 !== 3,
		);
		expect(items).toHaveLength(expected.length);
	});
});
