import { describe, expect, it } from "vitest";
import { makeBook } from "../../../test/book-fixture";
import {
	chipsOf,
	cycleValue,
	type FacetValues,
	FILTER_STORAGE_KEY,
	facetValuesOf,
	type LibraryFilter,
	loadFilter,
	matchesFilter,
	parseFilter,
	pruneFilter,
	removeValue,
	serializeFilter,
	valueState,
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
		rating: ["none"],
		progress: ["1-49"],
		added: [],
		lastRead: ["never"],
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

describe("facetValuesOf", () => {
	it("puts dates into every window that contains them", () => {
		const v = facetValuesOf(
			{
				status: "reading",
				tags: [],
				author: "",
				seriesId: null,
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
					status: "finished",
					tags: [],
					author: "",
					seriesId: null,
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

describe("speed", () => {
	it("filters 2000 books well inside a frame", () => {
		const books = Array.from({ length: 2000 }, (_, i) =>
			makeBook({
				id: `b${String(i).padStart(7, "0")}`,
				title: `Book ${i}`,
				tags: JSON.stringify([`t${i % 20}`, `u${i % 7}`]),
			}),
		);
		const start = performance.now();
		const items = filterAndSortLibrary(books, [], new Map(), {
			filter: { tags: sel(["t1", "t2"], ["u3"]) },
			sortBy: "title",
		});
		expect(performance.now() - start).toBeLessThan(200);
		expect(items.length).toBeGreaterThan(0);
	});
});
