import type React from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CollectionWithCount } from "../../../services/db/queries/collections";
import { click, type Rendered, render } from "../../../test/render";
import { BOOKS_DRAG_TYPE } from "../../collections/drag-data";

const navigate = vi.fn();
let location: { pathname: string; search: Record<string, string> } = {
	pathname: "/tabs/library",
	search: {},
};
let collections: CollectionWithCount[] = [];
let serials: { id: string; title: string; author: null; coverImage: null }[] = [];
let chapterCounts = new Map<string, number>();
let memberRows: { bookId: string; seriesIndex: number | null }[] = [];
const addNumbered = vi.fn();

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => navigate,
	useLocation: () => location,
	Link: ({
		to,
		params,
		search,
		children,
		...rest
	}: {
		to: string;
		params?: { id: string };
		search?: { collection?: string };
		children: React.ReactNode;
	}) => (
		<a
			href={`${to.replace("$id", params?.id ?? "")}${search?.collection ? `?collection=${search.collection}` : ""}`}
			{...rest}
		>
			{children}
		</a>
	),
}));
vi.mock("../../../services/db/hooks", () => ({
	queryHooks: {
		useCollections: () => ({ data: collections }),
		useSeriesMemberships: () => ({ data: new Map() }),
		useBooks: () => ({ data: { books: [], covers: new Map() } }),
		useSeriesList: () => ({ data: serials }),
		useSeriesChapterCounts: () => ({ data: chapterCounts }),
		useSeriesActivity: () => ({ data: new Map() }),
		useAddNumberedBooks: () => ({ mutate: addNumbered }),
	},
}));
vi.mock("../../../services/db/queries", () => ({
	queries: { getCollectionMembers: async () => memberRows },
}));
vi.mock("../../toast", () => ({ toast: { success: vi.fn() } }));

const { SidebarSeries } = await import("../sidebar-series");

function series(id: string, bookCount = 2): CollectionWithCount {
	return {
		id,
		name: `Series ${id}`,
		sortOrder: 1,
		ordered: true,
		seriesKey: id,
		view: null,
		deleted: false,
		createdAt: 1,
		updatedAt: 1,
		bookCount,
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

const rows = () =>
	[
		...(rendered?.container.querySelectorAll("[data-testid=sidebar-series] a") ?? []),
	] as HTMLElement[];
const allSeriesLink = () =>
	rendered?.container.querySelector<HTMLAnchorElement>("a[href='/tabs/library/all-series']");

describe("SidebarSeries", () => {
	it("renders nothing without a non-empty series", async () => {
		collections = [series("empty", 0), { ...series("plain"), seriesKey: null }];
		rendered = await render(<SidebarSeries isCollapsed={false} />);
		expect(rendered.container.innerHTML).toBe("");
	});

	it("lists book series and serials with their count and opens their page", async () => {
		collections = [series("dune", 6)];
		serials = [{ id: "wn", title: "Worm", author: null, coverImage: null }];
		chapterCounts = new Map([["wn", 304]]);
		rendered = await render(<SidebarSeries isCollapsed={false} />);
		expect(rows().map((r) => [r.getAttribute("href"), r.textContent])).toEqual([
			["/tabs/library?collection=dune", "#Series dune6"],
			["/tabs/library/series/wn", "≋Worm304"],
		]);
		expect(allSeriesLink()).toBeNull();
	});

	it("shows the first five and All series when there are more", async () => {
		collections = ["a", "b", "c", "d", "e", "f"].map((id) => series(id));
		rendered = await render(<SidebarSeries isCollapsed={false} />);
		expect(rows()).toHaveLength(5);
		expect(allSeriesLink()?.textContent).toBe("All series6");
	});

	it("marks the open series, or All series when it is not among the first five", async () => {
		collections = ["a", "b", "c", "d", "e", "f"].map((id) => series(id));
		location = { pathname: "/tabs/library", search: { collection: "b" } };
		rendered = await render(<SidebarSeries isCollapsed={false} />);
		expect(rows().map((r) => r.dataset.active)).toEqual([
			"false",
			"true",
			"false",
			"false",
			"false",
		]);
		expect(allSeriesLink()?.dataset.active).toBe("false");
		rendered.unmount();

		location = { pathname: "/tabs/library", search: { collection: "f" } };
		rendered = await render(<SidebarSeries isCollapsed={false} />);
		expect(rows().some((r) => r.dataset.active === "true")).toBe(false);
		expect(allSeriesLink()?.dataset.active).toBe("true");
	});

	it("a book dropped on a book series joins after its highest number", async () => {
		collections = [series("dune", 2)];
		memberRows = [
			{ bookId: "d1", seriesIndex: 1 },
			{ bookId: "d2", seriesIndex: 2.5 },
		];
		rendered = await render(<SidebarSeries isCollapsed={false} />);
		const row = rendered.container.querySelector("[data-testid=sidebar-series]");
		const drop = new Event("drop", { bubbles: true, cancelable: true });
		Object.defineProperty(drop, "dataTransfer", {
			value: {
				types: [BOOKS_DRAG_TYPE],
				getData: () => JSON.stringify(["new", "d1"]),
			},
		});
		await act(async () => {
			row?.dispatchEvent(drop);
		});
		await vi.waitFor(() => expect(addNumbered).toHaveBeenCalled());
		expect(addNumbered.mock.calls[0]?.[0]).toEqual({
			target: { collectionId: "dune" },
			numbers: new Map([
				["new", 3],
				["d1", 1],
			]),
		});
	});

	it("collapsed, one icon opens All series", async () => {
		collections = [series("dune")];
		rendered = await render(<SidebarSeries isCollapsed />);
		await click(rendered.getButton("All series"));
		expect(navigate).toHaveBeenCalledWith({ to: "/tabs/library/all-series" });
	});
});
