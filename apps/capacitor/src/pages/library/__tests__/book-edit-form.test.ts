import { describe, expect, it } from "vitest";
import {
	type BookEditValues,
	finalizeEditValues,
	isEditDirty,
	isSeriesDirty,
	planSeriesChange,
} from "../book-edit-form";
import { parseSeriesIndex } from "../series-field";

const values: BookEditValues = {
	title: "Red Rising",
	author: "Pierce Brown",
	description: null,
	language: "en",
	status: null,
	rating: null,
	review: null,
	tags: ["scifi"],
	hideFromProfile: false,
};

describe("isEditDirty", () => {
	it("is clean for an untouched form and dirty for any changed field", () => {
		expect(isEditDirty(values, { ...values, tags: [...values.tags] }, "")).toBe(false);
		expect(isEditDirty(values, { ...values, title: "Golden Son" }, "")).toBe(true);
		expect(isEditDirty(values, { ...values, tags: [] }, "")).toBe(true);
		expect(isEditDirty(values, { ...values, hideFromProfile: true }, "")).toBe(true);
	});

	it("counts a typed but uncommitted tag as a change", () => {
		expect(isEditDirty(values, values, "  ")).toBe(false);
		expect(isEditDirty(values, values, "space")).toBe(true);
	});
});

describe("finalizeEditValues", () => {
	it("trims the title and keeps a pending tag once", () => {
		expect(finalizeEditValues({ ...values, title: "  Red Rising " }, " space ")).toMatchObject({
			title: "Red Rising",
			tags: ["scifi", "space"],
		});
		expect(finalizeEditValues(values, "scifi").tags).toEqual(["scifi"]);
	});
});

describe("planSeriesChange", () => {
	const inRedRising = { collectionId: "series-red-rising", seriesIndex: 1 };

	it("does nothing when the series and number are unchanged", () => {
		const choice = { kind: "collection", collectionId: "series-red-rising", index: 1 } as const;
		expect(planSeriesChange(inRedRising, choice)).toEqual({ remove: null, add: null });
		expect(isSeriesDirty(inRedRising, choice)).toBe(false);
		expect(isSeriesDirty(null, { kind: "none" })).toBe(false);
	});

	it("rewrites only the number when the series stays", () => {
		const choice = { kind: "collection", collectionId: "series-red-rising", index: 2.5 } as const;
		expect(planSeriesChange(inRedRising, choice)).toEqual({ remove: null, add: choice });
	});

	it("moves the book: the old membership is tombstoned, the new one added", () => {
		const choice = { kind: "collection", collectionId: "c1", index: null } as const;
		expect(planSeriesChange(inRedRising, choice)).toEqual({
			remove: "series-red-rising",
			add: choice,
		});
	});

	it("removes the book from its series", () => {
		expect(planSeriesChange(inRedRising, { kind: "none" })).toEqual({
			remove: "series-red-rising",
			add: null,
		});
	});

	it("creates a new series for a book without one", () => {
		const choice = { kind: "new", name: "Iron Gold", index: 1 } as const;
		expect(planSeriesChange(null, choice)).toEqual({ remove: null, add: choice });
	});
});

describe("parseSeriesIndex", () => {
	it("reads decimals, clears on empty, rejects the rest", () => {
		expect(parseSeriesIndex("2.5")).toBe(2.5);
		expect(parseSeriesIndex("2,5")).toBe(2.5);
		expect(parseSeriesIndex(" ")).toBeNull();
		expect(parseSeriesIndex("-1")).toBeUndefined();
		expect(parseSeriesIndex("abc")).toBeUndefined();
		expect(parseSeriesIndex("100001")).toBeUndefined();
	});
});
