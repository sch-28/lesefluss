import { describe, expect, it } from "vitest";
import { type BookEditValues, editValuesToPatch } from "../book-edit-form";
import { bookSeriesLabel } from "../book-fields";

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

describe("bookSeriesLabel", () => {
	it("shows the number after the name, or the name alone", () => {
		expect(bookSeriesLabel({ seriesName: "Foundation", seriesIndex: 2.5 })).toBe("Foundation #2.5");
		expect(bookSeriesLabel({ seriesName: "Foundation", seriesIndex: null })).toBe("Foundation");
		expect(bookSeriesLabel({ seriesName: null, seriesIndex: 3 })).toBeNull();
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
