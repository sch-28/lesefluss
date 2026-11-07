import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../../test/render";
import {
	decodeFilterParam,
	encodeFilterParam,
	FILTER_STORAGE_KEY,
	type LibraryFilter,
	serializeFilter,
} from "../filter-model";

type Search = { collection?: string; f?: string };
const router = vi.hoisted(() => ({
	search: {} as { collection?: string; f?: string },
	navigate: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
	useSearch: () => router.search,
	useNavigate: () => router.navigate,
}));

const { useLeaveMissingShelf, useLibraryFilter } = await import("../use-library-filter");

let result: [LibraryFilter, (filter: LibraryFilter) => void];
function Probe() {
	result = useLibraryFilter();
	return null;
}

/** The search the hook's last navigate call would leave. */
function navigatedTo(): Search {
	const call = router.navigate.mock.calls.at(-1)?.[0] as {
		search: (prev: Search) => Search;
		replace: boolean;
	};
	expect(call.replace).toBe(true);
	return call.search(router.search);
}

const tags: LibraryFilter = { tags: { in: ["scifi"], out: [] } };
const stored: LibraryFilter = { status: { in: ["reading"], out: [] } };

let view: Rendered | undefined;
beforeEach(() => {
	localStorage.clear();
	router.navigate.mockReset();
	router.search = {};
});
afterEach(() => {
	view?.unmount();
	view = undefined;
});

describe("useLibraryFilter", () => {
	it("applies the filter a link carries and keeps it for this device", async () => {
		localStorage.setItem(FILTER_STORAGE_KEY, serializeFilter(stored));
		router.search = { collection: "c1", f: encodeFilterParam(tags) };
		view = await render(<Probe />);
		expect(result[0]).toEqual(tags);
		expect(router.navigate).not.toHaveBeenCalled();
		expect(localStorage.getItem(FILTER_STORAGE_KEY)).toBe(serializeFilter(tags));
	});

	it("fills an address without a filter from this device's last one", async () => {
		localStorage.setItem(FILTER_STORAGE_KEY, serializeFilter(stored));
		view = await render(<Probe />);
		expect(result[0]).toEqual(stored);
		expect(decodeFilterParam(navigatedTo().f)).toEqual(stored);
	});

	it("replaces a broken filter in the address without throwing", async () => {
		router.search = { f: "%%%" };
		view = await render(<Probe />);
		expect(result[0]).toEqual({});
		expect(navigatedTo()).toEqual({ f: undefined });
	});

	it("writes a change to the address, keeping the other params, and to storage", async () => {
		router.search = { collection: "c1" };
		view = await render(<Probe />);
		result[1](tags);
		expect(navigatedTo()).toEqual({ collection: "c1", f: encodeFilterParam(tags) });
		expect(localStorage.getItem(FILTER_STORAGE_KEY)).toBe(serializeFilter(tags));
		result[1]({});
		expect(navigatedTo()).toEqual({ collection: "c1", f: undefined });
	});
});

describe("useLeaveMissingShelf", () => {
	function Leave({ shelf, missing }: { shelf?: string; missing: boolean }) {
		useLeaveMissingShelf(shelf, missing);
		return null;
	}

	it("returns to all books, not this device's last filter, once the open shelf is gone", async () => {
		localStorage.setItem(FILTER_STORAGE_KEY, serializeFilter(stored));
		view = await render(<Leave shelf="s1" missing />);
		expect(router.navigate).toHaveBeenCalledWith({
			to: "/tabs/library",
			search: {},
			replace: true,
		});
		expect(localStorage.getItem(FILTER_STORAGE_KEY)).toBe(serializeFilter({}));

		view.unmount();
		router.navigate.mockReset();
		router.search = {};
		view = await render(<Probe />);
		expect(result[0]).toEqual({});
	});

	it("keeps the device's filter while the shelf is there or none is open", async () => {
		localStorage.setItem(FILTER_STORAGE_KEY, serializeFilter(stored));
		view = await render(<Leave shelf="s1" missing={false} />);
		view.unmount();
		view = await render(<Leave missing />);
		expect(router.navigate).not.toHaveBeenCalled();
		expect(localStorage.getItem(FILTER_STORAGE_KEY)).toBe(serializeFilter(stored));
	});
});
