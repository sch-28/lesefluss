import { describe, expect, it } from "vitest";
import { headerControls } from "../header-controls";

describe("library header controls", () => {
	it("keeps only the layout control on the series page", () => {
		for (const isDesktop of [true, false]) {
			expect(headerControls({ isOrderedView: true, isDesktop })).toEqual({
				search: false,
				filter: false,
				sort: false,
				view: true,
			});
		}
	});

	it("hides them in an empty library", () => {
		expect(
			headerControls({ isOrderedView: false, isDesktop: false, isEmptyLibrary: true }),
		).toEqual({ search: false, filter: false, sort: false, view: false });
	});

	it("shows them in the library, Filter on the phone only", () => {
		expect(headerControls({ isOrderedView: false, isDesktop: true })).toEqual({
			search: true,
			filter: false,
			sort: true,
			view: true,
		});
		expect(headerControls({ isOrderedView: false, isDesktop: false })).toEqual({
			search: true,
			filter: true,
			sort: true,
			view: true,
		});
	});
});
