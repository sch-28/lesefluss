import { describe, expect, it } from "vitest";
import {
	addTag,
	canAddTag,
	effectiveSort,
	exploreMode,
	parseExploreSearch,
	removeTag,
	tagLabelFromId,
	withSearch,
} from "../explore-search";

describe("parseExploreSearch", () => {
	it("restores every field a shared link can carry", () => {
		expect(
			parseExploreSearch({
				q: "ghosts",
				genre: "horror",
				tags: "ghost-stories,short-stories",
				lang: "DE",
				sort: "title",
				source: "standard_ebooks",
				view: "list",
				scope: "catalog",
			}),
		).toEqual({
			q: "ghosts",
			genre: "horror",
			author: undefined,
			tags: "ghost-stories,short-stories",
			lang: "de",
			sort: "title",
			source: "standard_ebooks",
			view: "list",
			scope: "catalog",
		});
	});

	it("drops malformed values instead of failing navigation", () => {
		expect(
			parseExploreSearch({
				q: "   ",
				tags: "Bad Tag,,ok-tag,ok-tag",
				lang: "english",
				sort: "random",
				source: "librivox",
				view: "table",
				scope: "everything",
			}),
		).toEqual({
			q: undefined,
			genre: undefined,
			author: undefined,
			tags: "ok-tag",
			lang: undefined,
			sort: undefined,
			source: undefined,
			view: undefined,
			scope: undefined,
		});
	});
});

describe("tags in the URL", () => {
	it("adds tags without duplicates and removes them", () => {
		let s = addTag({ q: "x" }, "ghost-stories");
		s = addTag(s, "short-stories");
		s = addTag(s, "ghost-stories");
		expect(s).toEqual({ q: "x", tags: "ghost-stories,short-stories" });
		s = removeTag(s, "ghost-stories");
		expect(s).toEqual({ q: "x", tags: "short-stories" });
		expect(removeTag(s, "short-stories")).toEqual({ q: "x" });
	});

	it("never builds a request past the catalog's tag limit", () => {
		let s = {};
		for (const id of ["a", "b", "c", "d", "e", "f"]) s = addTag(s, id);
		expect(s).toEqual({ tags: "a,b,c,d,e" });
		expect(canAddTag(s)).toBe(false);
		expect(parseExploreSearch({ tags: "a,b,c,d,e,f,g" }).tags).toBe("a,b,c,d,e");
	});

	it("labels an id it has no label for yet", () => {
		expect(tagLabelFromId("ghost-stories")).toBe("Ghost stories");
	});
});

describe("withSearch", () => {
	it("drops keys patched to undefined", () => {
		expect(withSearch({ q: "a", genre: "drama" }, { genre: undefined, sort: "title" })).toEqual({
			q: "a",
			sort: "title",
		});
	});
});

describe("exploreMode", () => {
	it("shows the landing with nothing set", () => {
		expect(exploreMode({})).toBe("landing");
		expect(exploreMode({ lang: "de", view: "list" })).toBe("landing");
	});

	it("groups a plain query across sources", () => {
		expect(exploreMode({ q: "cradle" })).toBe("grouped");
	});

	it("goes catalog-only for see-all or catalog filters", () => {
		expect(exploreMode({ q: "cradle", scope: "catalog" })).toBe("catalog");
		expect(exploreMode({ q: "cradle", tags: "fantasy" })).toBe("catalog");
		expect(exploreMode({ genre: "drama" })).toBe("catalog");
		expect(exploreMode({ source: "gutenberg" })).toBe("catalog");
		expect(exploreMode({ author: "Mary Shelley" })).toBe("catalog");
	});
});

describe("effectiveSort", () => {
	it("mirrors the server default", () => {
		expect(effectiveSort({ q: "x" })).toBe("relevance");
		expect(effectiveSort({ genre: "drama" })).toBe("popular");
		expect(effectiveSort({ q: "x", sort: "recent" })).toBe("recent");
	});
});
