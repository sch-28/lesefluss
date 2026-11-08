import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { click, flush, type Rendered, render } from "../../../test/render";
import { parseStatsSearch } from "../stats/stats-search";

const sessions = vi.hoisted(() => ({ count: 3 }));
vi.mock("../../../services/db/hooks", () => ({
	queryHooks: {
		useReadingSessionCount: () => ({ data: sessions.count, isLoading: false }),
		useStatsStreak: () => ({ data: { current: 1, longest: 2, freezesBanked: 0 } }),
	},
}));
vi.mock("../../../components/speed-chip/speed-chip", () => ({ SpeedChip: () => null }));
const marker = (name: string) => () => <div data-testid={name} />;
vi.mock("../stats/hero", () => ({ Hero: marker("overview") }));
vi.mock("../stats/period-totals", () => ({ PeriodTotals: () => null, PeriodTabs: () => null }));
vi.mock("../stats/currently-reading", () => ({ CurrentlyReading: () => null }));
vi.mock("../stats/records-card", () => ({ RecordsCard: () => null }));
vi.mock("../stats/finished-shelf", () => ({ FinishedShelf: () => null }));
vi.mock("../stats/top-books", () => ({ TopBooks: () => null }));
vi.mock("../stats/activity", () => ({ Activity: () => null }));
vi.mock("../stats/speed-tab/speed-tab", () => ({ SpeedTab: marker("speed") }));
vi.mock("../stats/empty-state", () => ({ EmptyState: marker("empty") }));
vi.mock("../stats/sessions-tab", () => ({
	SessionsTab: ({
		bookId,
		onBookChange,
	}: {
		bookId?: string;
		onBookChange: (id: string | undefined) => void;
	}) => (
		<div data-testid="sessions">
			{bookId ?? "all books"}
			<button type="button" onClick={() => onBookChange("e1e1e1e1")}>
				Pick
			</button>
			<button type="button" onClick={() => onBookChange(undefined)}>
				Clear
			</button>
		</div>
	),
}));

const { default: Stats } = await import("../stats");

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
	sessions.count = 3;
});

async function open(url: string) {
	const root = createRootRoute();
	const stats = createRoute({
		getParentRoute: () => root,
		path: "/tabs/library/stats",
		validateSearch: parseStatsSearch,
		component: Stats,
	});
	const router = createRouter({
		routeTree: root.addChildren([stats]),
		history: createMemoryHistory({ initialEntries: [url] }),
	});
	view = await render(<RouterProvider router={router} />);
	await flush();
	return router;
}

const shown = () => view?.container.querySelector("[data-testid]")?.getAttribute("data-testid");

async function tap(label: string) {
	const tab = [...(view?.container.querySelectorAll("[role=tab]") ?? [])].find(
		(t) => t.textContent === label,
	);
	if (!tab) throw new Error(`no ${label} tab`);
	await act(async () => {
		tab.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
	});
	await flush();
}

describe("Stats tabs", () => {
	it("opens on Overview at the bare address", async () => {
		await open("/tabs/library/stats");
		expect(shown()).toBe("overview");
	});

	it("opens the tab and book filter the address names", async () => {
		await open("/tabs/library/stats?tab=sessions&book=f0f0f0f0");
		expect(shown()).toBe("sessions");
		expect(view?.text()).toContain("f0f0f0f0");
	});

	it("puts a tapped tab in the address, and Overview back to the bare one", async () => {
		const router = await open("/tabs/library/stats");
		await tap("Speed");
		expect(shown()).toBe("speed");
		expect(router.state.location.search).toEqual({ tab: "speed" });
		await tap("Sessions");
		expect(shown()).toBe("sessions");
		expect(router.state.location.search).toEqual({ tab: "sessions" });
		await tap("Overview");
		expect(shown()).toBe("overview");
		expect(router.state.location.search).toEqual({});
	});

	it("keeps the Sessions tab in the address while the book filter changes", async () => {
		const router = await open("/tabs/library/stats?tab=sessions");
		await click(view?.getButton("Pick") as HTMLButtonElement);
		expect(router.state.location.search).toEqual({ tab: "sessions", book: "e1e1e1e1" });
		expect(view?.text()).toContain("e1e1e1e1");
		await click(view?.getButton("Clear") as HTMLButtonElement);
		expect(router.state.location.search).toEqual({ tab: "sessions" });
		expect(shown()).toBe("sessions");
	});

	it("keeps the Speed tab reachable before the first sitting", async () => {
		sessions.count = 0;
		const router = await open("/tabs/library/stats");
		expect(shown()).toBe("empty");
		await tap("Speed");
		expect(shown()).toBe("speed");
		expect(router.state.location.search).toEqual({ tab: "speed" });
	});
});
