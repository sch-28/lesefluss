import type React from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CollectionWithCount } from "../../../services/db/queries/collections";
import { click, type Rendered, render } from "../../../test/render";
import type { SeriesEntry } from "../series-nav";

const navigate = vi.fn();
let location: { pathname: string; search: Record<string, string> } = {
	pathname: "/tabs/library",
	search: {},
};
let collections: CollectionWithCount[] = [];
let serials: { id: string; title: string; author: null; coverImage: null }[] = [];
let chapterCounts = new Map<string, number>();
const menuFor = vi.fn();

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => navigate,
	useLocation: () => location,
}));
vi.mock(
	"@lesefluss/ui/drawer",
	async () => (await import("../../../test/overlay-mocks")).drawerModule,
);
vi.mock("../../../services/db/hooks", () => ({
	queryHooks: {
		useCollections: () => ({ data: collections }),
		useSeriesMemberships: () => ({ data: new Map() }),
		useBooks: () => ({ data: { books: [], covers: new Map() } }),
		useSeriesList: () => ({ data: serials }),
		useSeriesChapterCounts: () => ({ data: chapterCounts }),
		useSeriesActivity: () => ({ data: new Map() }),
	},
}));
vi.mock("../use-smart-shelves", () => ({
	useSmartShelves: () => ({ shelves: [], counts: new Map(), setBuiltInPinned: vi.fn() }),
}));
vi.mock("../../../components/smart-shelves/shelf-actions", () => ({
	openShelf: vi.fn(),
	ShelfActions: () => null,
}));
vi.mock("../../../components/collections/collection-actions", () => ({
	CollectionActions: ({
		collection,
		collections: siblings,
	}: {
		collection: CollectionWithCount | null;
		collections: CollectionWithCount[];
	}): React.ReactNode => {
		if (collection)
			menuFor(
				collection.id,
				siblings.map((c) => c.id),
			);
		return null;
	},
}));

const {
	default: CollectionShelfRow,
	inShelfOrder,
	splitChips,
} = await import("../collection-shelf-row");

function collection(id: string, seriesKey: string | null = null): CollectionWithCount {
	return {
		id,
		name: `C ${id}`,
		sortOrder: 1,
		ordered: seriesKey !== null,
		seriesKey,
		view: null,
		deleted: false,
		createdAt: 1,
		updatedAt: 1,
		bookCount: 2,
	};
}

let rendered: Rendered | undefined;
beforeEach(() => {
	vi.clearAllMocks();
	location = { pathname: "/tabs/library", search: {} };
	collections = [];
	serials = [];
	chapterCounts = new Map();
});
afterEach(() => {
	rendered?.unmount();
	rendered = undefined;
});

const row = () =>
	[...(rendered?.container.querySelectorAll("[role=toolbar] button") ?? [])] as HTMLElement[];
const sheet = () => rendered?.container.querySelector("[data-testid=sheet]");

describe("splitChips", () => {
	it("keeps the first ones in the row and pulls an open overflow chip in", () => {
		const chips = "abcd".split("").map((id) => ({ id, active: id === "d" }));
		const { inline, more } = splitChips(chips, 2);
		expect(inline.map((c) => c.id)).toEqual(["a", "b", "d"]);
		expect(more.map((c) => c.id)).toEqual(["c"]);
	});
});

describe("inShelfOrder", () => {
	it("lists book series in their collection order, so a reorder shows, and serials after", () => {
		const entry = (kind: "book" | "serial", id: string) => ({ kind, id }) as SeriesEntry;
		const ordered = inShelfOrder(
			[entry("serial", "s"), entry("book", "b"), entry("book", "a")],
			[{ id: "a" }, { id: "b" }],
		);
		expect(ordered.map((e) => e.id)).toEqual(["a", "b", "s"]);
	});
});

describe("CollectionShelfRow", () => {
	it("shows collections and series in one row, series with their count", async () => {
		collections = [collection("plain"), collection("dune", "dune")];
		serials = [{ id: "wn", title: "Worm", author: null, coverImage: null }];
		chapterCounts = new Map([["wn", 40]]);
		rendered = await render(<CollectionShelfRow activeId={undefined} activeShelfId={undefined} />);
		expect(row().map((b) => b.textContent)).toEqual(["All", "C plain2", "C dune2", "Worm40", ""]);
		expect(rendered.container.querySelectorAll("[data-testid=shelf-series]")).toHaveLength(2);
		expect(rendered.container.textContent).not.toContain("#");

		await click(row()[2] as HTMLElement);
		expect(navigate).toHaveBeenCalledWith({ to: "/tabs/library", search: { collection: "dune" } });
		await click(row()[3] as HTMLElement);
		expect(navigate).toHaveBeenCalledWith({ to: "/tabs/library/series/$id", params: { id: "wn" } });
	});

	it("a series chip's right-click opens the collection menu among the series", async () => {
		collections = [collection("plain"), collection("dune", "dune"), collection("earth", "earth")];
		rendered = await render(<CollectionShelfRow activeId={undefined} activeShelfId={undefined} />);
		const dune = rendered.container.querySelector("[data-testid=shelf-series]") as HTMLElement;
		await act(async () => {
			dune.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
		});
		expect(menuFor).toHaveBeenLastCalledWith("dune", ["dune", "earth"]);
	});

	it("puts chips past the limit in the More sheet and opens them from there", async () => {
		collections = Array.from({ length: 12 }, (_, i) => collection(`c${i}`));
		rendered = await render(<CollectionShelfRow activeId={undefined} activeShelfId={undefined} />);
		expect(rendered.container.querySelectorAll("[data-testid=shelf-collection]")).toHaveLength(10);
		await click(rendered.getButton("More, 2 more"));
		expect(sheet()?.textContent).toContain("C c11");
		expect(sheet()?.textContent).toContain("New collection");
		const c11 = [...(sheet()?.querySelectorAll("button") ?? [])].find((b) =>
			b.textContent?.includes("C c11"),
		) as HTMLElement;
		await click(c11);
		expect(navigate).toHaveBeenCalledWith({ to: "/tabs/library", search: { collection: "c11" } });
		expect(sheet()).toBeNull();
	});
});
