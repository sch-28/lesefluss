import { describe, expect, it } from "vitest";
import { headerControls } from "../header-controls";

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
