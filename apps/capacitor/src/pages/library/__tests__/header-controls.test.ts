import { describe, expect, it } from "vitest";
import { headerControls } from "../header-controls";

describe("library header controls", () => {
	it("hides search, filter, sort, columns and the view toggle on the series page", () => {
		for (const isDesktop of [true, false]) {
			expect(headerControls({ isOrderedView: true, isDesktop, shownView: "table" })).toEqual({
				search: false,
				filter: false,
				sort: false,
				columns: false,
				viewToggle: false,
			});
		}
	});

	it("shows them in the library, Filter on the phone and Columns with the table only", () => {
		expect(headerControls({ isOrderedView: false, isDesktop: true, shownView: "table" })).toEqual({
			search: true,
			filter: false,
			sort: true,
			columns: true,
			viewToggle: true,
		});
		expect(headerControls({ isOrderedView: false, isDesktop: false, shownView: "grid" })).toEqual({
			search: true,
			filter: true,
			sort: true,
			columns: false,
			viewToggle: true,
		});
	});
});
