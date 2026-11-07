import { afterEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../../test/render";

const books = { data: { books: [], covers: new Map() }, isPending: false };
const list = { data: [], isPending: false };
const map = { data: new Map(), isPending: false };

vi.mock("../../../services/db/hooks", () => ({
	queryHooks: {
		useBooks: () => books,
		useSeriesList: () => list,
		useSeriesChapterCounts: () => map,
		useSeriesActivity: () => map,
		useSeriesChapterLengths: () => map,
		useCollectionMemberships: () => map,
		useCollections: () => list,
		useStatsSpeedModel: () => ({ data: undefined }),
	},
}));
vi.mock("../sort-filter", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../sort-filter")>();
	return { ...actual, buildLibraryItems: vi.fn(actual.buildLibraryItems) };
});

const { buildLibraryItems } = await import("../sort-filter");
const { useShelfLibrary } = await import("../use-smart-shelves");

function Reader({ enabled = true }: { enabled?: boolean }) {
	useShelfLibrary(enabled);
	return null;
}

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

describe("useShelfLibrary", () => {
	it("derives the library once for every reader of the same data", async () => {
		view = await render(
			<>
				<Reader />
				<Reader />
				<Reader />
				<Reader enabled={false} />
			</>,
		);
		expect(buildLibraryItems).toHaveBeenCalledTimes(1);
	});
});
