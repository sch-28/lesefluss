import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CollectionWithCount } from "../../../services/db/queries/collections";
import { click, type Rendered, render } from "../../../test/render";

const navigate = vi.fn();
let location: { pathname: string; search: Record<string, string> } = {
	pathname: "/tabs/library",
	search: {},
};
let collections: CollectionWithCount[] = [];
let serials: { id: string; title: string; author: null; coverImage: null }[] = [];
let chapterCounts = new Map<string, number>();

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => navigate,
	useLocation: () => location,
}));
vi.mock("../../../components/cover-image", () => ({ default: () => null }));
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

const { default: SeriesChipRow } = await import("../series-chip-row");

function series(id: string, name = `Series ${id}`): CollectionWithCount {
	return {
		id,
		name,
		sortOrder: 1,
		ordered: true,
		seriesKey: id,
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

const chips = () =>
	[...(rendered?.container.querySelectorAll("[data-testid=series-chip]") ?? [])] as HTMLElement[];
const sheet = () => rendered?.container.querySelector("[data-testid=sheet]");
const searchBox = () => rendered?.container.querySelector<HTMLInputElement>("input[type=search]");

async function type(value: string) {
	const input = searchBox();
	if (!input) throw new Error("no search box");
	await act(async () => {
		const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
		setter?.call(input, value);
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
}

async function press(key: string) {
	await act(async () => {
		searchBox()?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
	});
}

describe("SeriesChipRow", () => {
	it("renders nothing without series", async () => {
		collections = [{ ...series("plain"), seriesKey: null }];
		rendered = await render(<SeriesChipRow />);
		expect(rendered.container.innerHTML).toBe("");
	});

	it("puts All N first, then the first eight series, and opens one", async () => {
		collections = "abcdefghij".split("").map((id) => series(id));
		serials = [{ id: "wn", title: "Worm", author: null, coverImage: null }];
		chapterCounts = new Map([["wn", 3]]);
		rendered = await render(<SeriesChipRow />);
		const buttons = [...rendered.container.querySelectorAll("[role=toolbar] button")];
		expect(buttons[0]?.textContent).toBe("All 11");
		expect(chips()).toHaveLength(8);

		location = { pathname: "/tabs/library", search: { collection: "b" } };
		await click(chips()[1] as HTMLElement);
		expect(navigate).toHaveBeenCalledWith({ to: "/tabs/library", search: { collection: "b" } });
	});

	it("marks the open series chip", async () => {
		collections = [series("a"), series("b")];
		location = { pathname: "/tabs/library", search: { collection: "b" } };
		rendered = await render(<SeriesChipRow />);
		expect(chips().map((c) => c.getAttribute("aria-pressed"))).toEqual(["false", "true"]);
	});

	it("All opens a sheet with a search; Enter opens the first match", async () => {
		collections = [series("dune", "Dune"), series("earth", "Earthsea")];
		serials = [{ id: "wn", title: "Wandering Inn", author: null, coverImage: null }];
		chapterCounts = new Map([["wn", 40]]);
		rendered = await render(<SeriesChipRow />);
		await click(rendered.getButton(/^All 3/));
		expect(sheet()?.textContent).toContain("All series · 3");

		await type("wander");
		expect(rendered.container.querySelector("[data-testid=all-series-count]")?.textContent).toBe(
			"1 of 3",
		);
		await press("Enter");
		expect(navigate).toHaveBeenCalledWith({ to: "/tabs/library/series/$id", params: { id: "wn" } });
		expect(sheet()).toBeNull();
	});

	it("filters by kind and Esc clears the search first", async () => {
		collections = [series("dune", "Dune")];
		serials = [{ id: "wn", title: "Worm", author: null, coverImage: null }];
		chapterCounts = new Map([["wn", 40]]);
		rendered = await render(<SeriesChipRow />);
		await click(rendered.getButton(/^All 2/));
		await click(rendered.getButton("Serials"));
		const rows = () =>
			[...(rendered?.container.querySelectorAll("button[data-series-row]") ?? [])].map(
				(r) => r.textContent,
			);
		expect(rows()).toHaveLength(1);
		expect(rows()[0]).toContain("Worm");

		await type("zzz");
		expect(rendered.text()).toContain("No series match.");
		await press("Escape");
		expect(searchBox()?.value).toBe("");
		expect(sheet()).not.toBeNull();
	});
});
