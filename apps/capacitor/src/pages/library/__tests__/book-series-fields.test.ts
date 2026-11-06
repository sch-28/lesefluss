import { describe, expect, it } from "vitest";
import { type BookEditValues, editValuesToPatch } from "../book-edit-sheet";
import { bookSeriesLabel, bookSeriesNames, parseSeriesIndexInput } from "../book-fields";

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
	seriesName: "Dune",
	seriesIndex: 2,
};

describe("parseSeriesIndexInput", () => {
	it("reads whole and decimal numbers, a comma as the decimal mark", () => {
		expect(parseSeriesIndexInput("3")).toBe(3);
		expect(parseSeriesIndexInput(" 2.5 ")).toBe(2.5);
		expect(parseSeriesIndexInput("2,5")).toBe(2.5);
	});

	it("is null for an empty field and undefined for text that is no number", () => {
		expect(parseSeriesIndexInput("  ")).toBeNull();
		for (const bad of ["abc", "-1", "1e3", "2.", "999999999"]) {
			expect(parseSeriesIndexInput(bad)).toBeUndefined();
		}
	});
});

describe("bookSeriesLabel", () => {
	it("shows the number after the name, or the name alone", () => {
		expect(bookSeriesLabel({ seriesName: "Foundation", seriesIndex: 2.5 })).toBe("Foundation #2.5");
		expect(bookSeriesLabel({ seriesName: "Foundation", seriesIndex: null })).toBe("Foundation");
		expect(bookSeriesLabel({ seriesName: null, seriesIndex: 3 })).toBeNull();
	});
});

describe("bookSeriesNames", () => {
	it("offers each name once, whatever its case, sorted", () => {
		const names = bookSeriesNames([
			{ seriesName: "Dune" },
			{ seriesName: null },
			{ seriesName: "dune" },
			{ seriesName: "Culture" },
		]);
		expect(names).toEqual(["Culture", "Dune"]);
	});
});

describe("editValuesToPatch and the series", () => {
	it("leaves an untouched series out, so a rating edit never bumps its revision", () => {
		const patch = editValuesToPatch({ ...values, rating: 8 }, values);
		expect(patch).not.toHaveProperty("seriesName");
		expect(patch).not.toHaveProperty("seriesIndex");
		expect(patch.rating).toBe(8);
	});

	it("writes a changed name or number", () => {
		expect(editValuesToPatch({ ...values, seriesIndex: 2.5 }, values)).toMatchObject({
			seriesName: "Dune",
			seriesIndex: 2.5,
		});
		expect(editValuesToPatch({ ...values, seriesName: "  Dune Saga " }, values)).toMatchObject({
			seriesName: "Dune Saga",
		});
	});

	it("clears the number with the name", () => {
		expect(editValuesToPatch({ ...values, seriesName: "  " }, values)).toMatchObject({
			seriesName: null,
			seriesIndex: null,
		});
	});

	it("writes the series when there is no starting point, as on import", () => {
		expect(editValuesToPatch(values)).toMatchObject({ seriesName: "Dune", seriesIndex: 2 });
	});
});
