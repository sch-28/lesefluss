import { describe, expect, it } from "vitest";
import { FACETS, type Facet, type LibraryFilter } from "./filter-model";
import type { FacetOptions } from "./filter-picker";
import {
	commitQuery,
	parseToken,
	parseWordRange,
	pickSuggestion,
	searchTextOf,
	suggestionsFor,
} from "./query-syntax";

const opt = (value: string, label = value) => ({ value, label, count: 1 });

const options = {
	...(Object.fromEntries(FACETS.map((f) => [f, []])) as unknown as FacetOptions),
	tags: [opt("fantasy"), opt("to read"), opt("Märchen")],
	status: [
		opt("want", "Want to read"),
		opt("reading", "Reading"),
		opt("finished", "Finished"),
		opt("dropped", "Dropped"),
	],
	author: [opt("Ursula K. Le Guin")],
	series: [opt("series-00000000000000e5", "Earthsea")],
	rating: ["5", "4", "3", "2", "1", "none"].map((v) => opt(v)),
	collection: [opt("c1", "Favourites"), opt("c2", "Sci Fi"), opt("c3", "Café")],
} satisfies Record<Facet, unknown>;

const commit = (input: string, filter: LibraryFilter = {}, all = true) =>
	commitQuery(input, filter, options, all);

describe("search syntax", () => {
	it("turns include and exclude tokens into chips", () => {
		expect(commit("tag:fantasy")?.filter).toEqual({ tags: { in: ["fantasy"], out: [] } });
		expect(commit('-tag:"to read"')?.filter).toEqual({ tags: { in: [], out: ["to read"] } });
		expect(commit("-status:dropped")?.filter).toEqual({ status: { in: [], out: ["dropped"] } });
	});

	it("matches status by id or label, and fields case-insensitively", () => {
		expect(commit("status:Finished")?.filter.status?.in).toEqual(["finished"]);
		expect(commit('STATUS:"want to read"')?.filter.status?.in).toEqual(["want"]);
	});

	it("maps a rating operator onto the star values", () => {
		expect(commit("rating:>=4")?.filter.rating?.in).toEqual(["4", "5"]);
		expect(commit("rating:<2")?.filter.rating?.in).toEqual(["1"]);
		expect(commit("rating:5")?.filter.rating?.in).toEqual(["5"]);
		expect(commit("rating:none")?.filter.rating?.in).toEqual(["none"]);
		expect(commit("rating:>5")).toBeNull();
	});

	it("matches author, series and collections by name, accents folded", () => {
		expect(commit('author:"ursula k. le guin"')?.filter.author?.in).toEqual(["Ursula K. Le Guin"]);
		expect(commit("series:earthsea")?.filter.series?.in).toEqual(["series-00000000000000e5"]);
		expect(commit("in:Favourites")?.filter.collection?.in).toEqual(["c1"]);
		expect(commit('in:"sci fi"')?.filter.collection?.in).toEqual(["c2"]);
		expect(commit("in:cafe")?.filter.collection?.in).toEqual(["c3"]);
		expect(commit("-in:Favourites")?.filter.collection?.out).toEqual(["c1"]);
		expect(commit("tag:marchen")?.filter.tags?.in).toEqual(["Märchen"]);
	});

	it("sets the Length range like the picker's buckets", () => {
		expect(commit("words:<50k")?.filter.words).toEqual({ max: 50_000 });
		expect(commit("words:>=150k")?.filter.words).toEqual({ min: 150_000 });
		expect(commit("words:50k-150k")?.filter.words).toEqual({ min: 50_000, max: 150_000 });
		expect(parseWordRange("1.2m")).toBeNull();
		expect(parseWordRange("<1.2m")).toEqual({ max: 1_200_000 });
		expect(commit("-words:<50k")).toBeNull();
	});

	it("keeps plain text and unknown fields or values as text", () => {
		expect(commit("dune")).toBeNull();
		expect(commit("foo:bar")).toBeNull();
		expect(commit("tag:nonexistent")).toBeNull();
		expect(commit("in:Nowhere")).toBeNull();
		const mixed = commit("status:finished foo:bar dune");
		expect(mixed?.input).toBe("foo:bar dune");
		expect(mixed?.filter).toEqual({ status: { in: ["finished"], out: [] } });
	});

	it("commits a token on space but leaves the one being typed", () => {
		expect(commitQuery("status:finished ", {}, options)?.input).toBe("");
		expect(commitQuery("status:finished tag:fan", {}, options)?.input).toBe("tag:fan");
		expect(commitQuery("tag:fantasy", {}, options)).toBeNull();
		expect(commitQuery('tag:"to ', {}, options)).toBeNull();
	});

	it("adds to the filter already set", () => {
		const filter: LibraryFilter = { tags: { in: ["fantasy"], out: [] } };
		expect(commit("-tag:Märchen", filter)?.filter.tags).toEqual({
			in: ["fantasy"],
			out: ["Märchen"],
		});
	});

	it("searches without a known field still being typed", () => {
		expect(searchTextOf("dune tag:fa")).toBe("dune ");
		expect(searchTextOf("dune foo:bar")).toBe("dune foo:bar");
		expect(searchTextOf("dune")).toBe("dune");
	});

	it("suggests fields, then values, and a pick finishes the token", () => {
		expect(suggestionsFor("st", options).map((s) => s.insert)).toEqual(["status:"]);
		expect(suggestionsFor("-ta", options).map((s) => s.insert)).toEqual(["-tag:"]);
		const values = suggestionsFor("tag:to", options);
		expect(values.map((s) => s.insert)).toEqual(['tag:"to read"']);
		expect(pickSuggestion("dune tag:to", values[0])).toBe('dune tag:"to read"');
		expect(suggestionsFor("in:", options).map((s) => s.label)).toEqual([
			"Favourites",
			"Sci Fi",
			"Café",
		]);
		const lengths = suggestionsFor("words:", options).map((s) => s.insert);
		expect(lengths).toContain("words:<=50k");
		for (const insert of lengths) expect(parseToken(insert, options)?.kind).toBe("words");
		expect(suggestionsFor("dune ", options)).toEqual([]);
	});
});
