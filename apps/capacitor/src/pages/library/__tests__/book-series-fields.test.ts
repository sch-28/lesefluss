import { describe, expect, it } from "vitest";
import type { CollectionWithCount } from "../../../services/db/queries/collections";
import { type BookEditValues, editValuesToPatch } from "../book-edit-form";
import { bookSeriesOf } from "../use-book-series";

const values: BookEditValues = {
	title: "Dune Messiah",
	author: null,
	description: null,
	language: null,
	status: null,
	rating: null,
	review: null,
	tags: [],
	hideFromProfile: false,
};

function collection(id: string): CollectionWithCount {
	return {
		id,
		name: `Series ${id}`,
		sortOrder: 1,
		ordered: true,
		seriesKey: id,
		view: null,
		deleted: false,
		createdAt: 1,
		updatedAt: 1,
		bookCount: 1,
	};
}

describe("bookSeriesOf", () => {
	it("reads the series from membership, the first live one in sidebar order", () => {
		const collections = [collection("a"), collection("b")];
		expect(
			bookSeriesOf(
				[
					{ collectionId: "gone", seriesIndex: 9 },
					{ collectionId: "b", seriesIndex: 2.5 },
					{ collectionId: "a", seriesIndex: 1 },
				],
				collections,
			),
		).toEqual({ collectionId: "b", name: "Series b", index: 2.5 });
	});

	it("is null for a book in no series, whatever its import hint said", () => {
		expect(bookSeriesOf(undefined, [collection("a")])).toBeNull();
		expect(bookSeriesOf([], [collection("a")])).toBeNull();
	});
});

describe("editValuesToPatch", () => {
	it("never writes the series hint", () => {
		const patch = editValuesToPatch({ ...values, rating: 8 });
		expect(patch).toMatchObject({ rating: 8 });
		expect(patch).not.toHaveProperty("seriesName");
		expect(patch).not.toHaveProperty("seriesIndex");
	});
});
