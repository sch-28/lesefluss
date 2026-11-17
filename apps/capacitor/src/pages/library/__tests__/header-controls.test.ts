import { describe, expect, it } from "vitest";
import { headerControls, selectControl } from "../header-controls";

describe("library toolbar controls", () => {
	it("hides them in an empty library", () => {
		expect(headerControls({ isEmptyLibrary: true })).toEqual({
			search: false,
			filter: false,
			sort: false,
			view: false,
		});
	});

	it("shows search, filter, sort and view in the library and on the series page", () => {
		expect(headerControls({ isEmptyLibrary: false })).toEqual({
			search: true,
			filter: true,
			sort: true,
			view: true,
		});
	});
});

describe("header selection control", () => {
	it("gives a phone none, selecting or not", () => {
		expect(selectControl({ isDesktop: false, isSelecting: false, canSelect: true })).toBeNull();
		expect(selectControl({ isDesktop: false, isSelecting: true, canSelect: true })).toBeNull();
	});

	it("is Select on desktop where a selection can start, and nothing where it can't", () => {
		expect(selectControl({ isDesktop: true, isSelecting: false, canSelect: true })).toBe("select");
		expect(selectControl({ isDesktop: true, isSelecting: false, canSelect: false })).toBeNull();
	});

	it("turns into Done while selecting, even in a view that couldn't start one", () => {
		expect(selectControl({ isDesktop: true, isSelecting: true, canSelect: true })).toBe("done");
		expect(selectControl({ isDesktop: true, isSelecting: true, canSelect: false })).toBe("done");
	});
});
