import { consumeBackPress } from "@lesefluss/ui/overlay-back";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { type Rendered, render } from "../../../test/render";
import { useLibrarySearch } from "../use-library-search";

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

let api: ReturnType<typeof useLibrarySearch>;
function Probe() {
	api = useLibrarySearch();
	return null;
}

function back(): boolean {
	let consumed = false;
	act(() => {
		consumed = consumeBackPress();
	});
	return consumed;
}

describe("useLibrarySearch", () => {
	it("Android back closes an open search and clears its query (LESE-185.11)", async () => {
		view = await render(<Probe />);
		act(() => api.toggleSearch());
		act(() => api.setSearch("dune"));
		expect(api.isSearchOpen).toBe(true);

		expect(back()).toBe(true);
		expect(api.isSearchOpen).toBe(false);
		expect(api.search).toBe("");
	});

	it("leaves back to the router while the search is closed", async () => {
		view = await render(<Probe />);
		expect(back()).toBe(false);
		act(() => api.toggleSearch());
		act(() => api.closeSearch());
		expect(back()).toBe(false);
	});
});
