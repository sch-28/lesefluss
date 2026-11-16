import { describe, expect, it } from "vitest";
import { headerControls } from "../header-controls";

describe("library toolbar controls", () => {
	it("keeps only the layout control on the series page", () => {
		expect(headerControls({ isOrderedView: true })).toEqual({
			search: false,
			filter: false,
			sort: false,
			view: true,
		});
	});

	it("hides them in an empty library", () => {
		expect(headerControls({ isOrderedView: false, isEmptyLibrary: true })).toEqual({
			search: false,
			filter: false,
			sort: false,
			view: false,
		});
	});

	it("shows search, filter, sort and view in the library on every screen", () => {
		expect(headerControls({ isOrderedView: false })).toEqual({
			search: true,
			filter: true,
			sort: true,
			view: true,
		});
	});
});
