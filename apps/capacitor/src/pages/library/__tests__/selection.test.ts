import { describe, expect, it } from "vitest";
import type { Book, Series } from "../../../services/db/schema";
import {
	deselectAllVisible,
	dragSelection,
	isAllVisibleSelected,
	rangeIds,
	selectAllVisible,
	selectableIds,
	selectedBooks,
	toggleSelected,
} from "../selection";
import type { LibraryItem } from "../sort-filter";

function book(id: string, title = id): Book {
	return { id, title } as Book;
}

const SORT_KEY: LibraryItem["sortKey"] = {
	title: "",
	author: "",
	recency: 0,
	progress: 0,
	status: "want",
	rating: null,
	tags: [],
	minutesLeft: null,
	words: null,
	series: null,
	collections: null,
	added: 0,
	lastRead: null,
};

const FACETS: LibraryItem["facets"] = {
	status: [],
	tags: [],
	author: [],
	series: [],
	collection: [],
	rating: [],
	progress: [],
	timeLeft: [],
	added: [],
	lastRead: [],
	wordCount: null,
	raw: { title: "", author: "", rating: null, progress: 0, addedAt: 0, lastRead: null },
};

function bookItem(id: string): LibraryItem {
	return { kind: "book", book: book(id), sortKey: SORT_KEY, facets: FACETS };
}

function seriesItem(id: string): LibraryItem {
	return {
		kind: "series",
		series: { id, title: id } as Series,
		activity: undefined,
		sortKey: SORT_KEY,
		facets: FACETS,
	};
}

describe("selectableIds", () => {
	it("returns book ids and ignores series", () => {
		expect(selectableIds([bookItem("a"), seriesItem("s1"), bookItem("b")])).toEqual(["a", "b"]);
	});
});

describe("toggleSelected", () => {
	it("adds an id that is not selected and removes one that is", () => {
		const once = toggleSelected(new Set(), "a");
		expect([...once]).toEqual(["a"]);
		expect([...toggleSelected(once, "a")]).toEqual([]);
	});

	it("does not mutate the set it was given", () => {
		const original = new Set(["a"]);
		toggleSelected(original, "b");
		expect([...original]).toEqual(["a"]);
	});
});

describe("selectAllVisible", () => {
	it("adds every visible book", () => {
		const next = selectAllVisible(new Set(), [bookItem("a"), seriesItem("s"), bookItem("b")]);
		expect([...next].sort()).toEqual(["a", "b"]);
	});

	// The selection outlives a filter change, so selecting all of a narrowed grid
	// must not silently discard what was picked before narrowing.
	it("keeps ids selected under an earlier filter", () => {
		const next = selectAllVisible(new Set(["hidden"]), [bookItem("visible")]);
		expect([...next].sort()).toEqual(["hidden", "visible"]);
	});
});

describe("deselectAllVisible", () => {
	it("drops visible books and keeps hidden ones", () => {
		const next = deselectAllVisible(new Set(["hidden", "visible"]), [bookItem("visible")]);
		expect([...next]).toEqual(["hidden"]);
	});
});

describe("isAllVisibleSelected", () => {
	it("is true when every visible book is selected", () => {
		expect(isAllVisibleSelected(new Set(["a", "b"]), [bookItem("a"), bookItem("b")])).toBe(true);
	});

	it("is false when one visible book is missing", () => {
		expect(isAllVisibleSelected(new Set(["a"]), [bookItem("a"), bookItem("b")])).toBe(false);
	});

	// So the button offers "All" rather than a "None" that would do nothing.
	it("is false for an empty grid", () => {
		expect(isAllVisibleSelected(new Set(["a"]), [])).toBe(false);
	});

	it("ignores series, which cannot be selected", () => {
		expect(isAllVisibleSelected(new Set(["a"]), [bookItem("a"), seriesItem("s")])).toBe(true);
	});
});

describe("selectedBooks", () => {
	it("returns the selected books in library order, not insertion order", () => {
		const books = [book("a"), book("b"), book("c")];
		expect(selectedBooks(new Set(["c", "a"]), books).map((b) => b.id)).toEqual(["a", "c"]);
	});

	// A sync pull can delete a book while it is selected. Reading the count
	// through here is what makes that need no cleanup effect.
	it("drops ids whose book no longer exists", () => {
		expect(selectedBooks(new Set(["a", "gone"]), [book("a")]).map((b) => b.id)).toEqual(["a"]);
	});
});

describe("rangeIds", () => {
	const items = [bookItem("a"), seriesItem("s"), bookItem("b"), bookItem("c"), bookItem("d")];

	it("runs between the two books in the visible order, either direction, skipping series", () => {
		expect(rangeIds(items, "a", "c")).toEqual(["a", "b", "c"]);
		expect(rangeIds(items, "d", "b")).toEqual(["b", "c", "d"]);
	});

	// The filter can hide the anchor; a range to it would be a guess.
	it("is null when an end is not in the view", () => {
		expect(rangeIds(items, "hidden", "c")).toBeNull();
	});

	it("covers rows a virtualized grid has not rendered", () => {
		const many = Array.from({ length: 2000 }, (_, i) => bookItem(`b${i}`));
		expect(rangeIds(many, "b10", "b1990")).toHaveLength(1981);
		expect(selectAllVisible(new Set(), many).size).toBe(2000);
	});
});

describe("dragSelection", () => {
	const items = Array.from({ length: 12 }, (_, i) => bookItem(`b${i}`));
	const ids = (from: number, to: number) =>
		Array.from({ length: to - from + 1 }, (_, i) => `b${from + i}`);

	it("shrinks when the finger goes back, keeping books picked before the drag", () => {
		const base = new Set(["b0"]);
		expect([...dragSelection(base, items, "b3", "b9")].sort()).toEqual(["b0", ...ids(3, 9)].sort());
		expect([...dragSelection(base, items, "b3", "b6")].sort()).toEqual(["b0", ...ids(3, 6)].sort());
	});
});
