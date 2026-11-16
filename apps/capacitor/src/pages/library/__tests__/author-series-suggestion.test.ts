import { describe, expect, it } from "vitest";
import type {
	CollectionWithCount,
	SeriesMembership,
} from "../../../services/db/queries/collections";
import { suggestAuthorSeries } from "../author-series-suggestion";

const collection = (id: string, name: string) => ({ id, name }) as CollectionWithCount;
const red = collection("red", "Red Rising");
const dark = collection("dark", "Dark Age");
const collections = [red, dark];

const books = [
	{ id: "b1", author: "Pierce Brown" },
	{ id: "b2", author: "Brown, Pierce" },
	{ id: "b3", author: "Pierce Brown" },
	{ id: "x", author: "Someone Else" },
];

function memberships(entries: [string, SeriesMembership[]][]): Map<string, SeriesMembership[]> {
	return new Map(entries);
}

describe("suggestAuthorSeries", () => {
	it("suggests the author's series with the number after its highest", () => {
		const m = memberships([
			["b1", [{ collectionId: "red", seriesIndex: 1 }]],
			["b2", [{ collectionId: "red", seriesIndex: 2.5 }]],
		]);
		const book = { id: "new", author: "pierce  brown" };
		expect(suggestAuthorSeries(book, [...books, book], m, collections)).toEqual({
			collectionId: "red",
			name: "Red Rising",
			index: 3,
		});
	});

	it("picks the series with most of the author's books, then sidebar order", () => {
		const m = memberships([
			["b1", [{ collectionId: "dark", seriesIndex: 1 }]],
			["b2", [{ collectionId: "red", seriesIndex: 1 }]],
			["b3", [{ collectionId: "red", seriesIndex: 2 }]],
		]);
		expect(
			suggestAuthorSeries({ id: "new", author: "Pierce Brown" }, books, m, collections)?.name,
		).toBe("Red Rising");
		const tie = memberships([
			["b1", [{ collectionId: "dark", seriesIndex: 1 }]],
			["b2", [{ collectionId: "red", seriesIndex: 1 }]],
		]);
		expect(
			suggestAuthorSeries({ id: "new", author: "Pierce Brown" }, books, tie, collections)?.name,
		).toBe("Red Rising");
	});

	it("suggests nothing for a book already in a series, without an author, or with no match", () => {
		const m = memberships([["b1", [{ collectionId: "red", seriesIndex: 1 }]]]);
		expect(
			suggestAuthorSeries({ id: "b1", author: "Pierce Brown" }, books, m, collections),
		).toBeNull();
		expect(suggestAuthorSeries({ id: "new", author: null }, books, m, collections)).toBeNull();
		expect(
			suggestAuthorSeries({ id: "new", author: "Someone Else" }, books, m, collections),
		).toBeNull();
	});
});
