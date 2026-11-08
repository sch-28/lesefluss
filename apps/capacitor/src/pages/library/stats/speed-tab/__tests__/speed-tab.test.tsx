import type { Milestones, SpeedModel } from "@lesefluss/core";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SpeedInsights } from "../../../../../services/db/queries/stats";
import type { ShareCardData } from "../../../../../services/share-card/render";
import type { SpeedTabData } from "../../../../../services/stats/speed-tab";
import { click, type Rendered, render } from "../../../../../test/render";

const mutate = vi.fn();
const navigate = vi.fn();
const refetch = vi.fn();
let modelError = false;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const state: {
	model: SpeedModel | undefined;
	tab: SpeedTabData;
	insights: SpeedInsights;
	settings: { wpm: number; defaultReaderMode: string };
	milestones: Milestones;
	speedTests: { id: string; readingWpm: number; createdAt: number }[];
} = {
	model: undefined,
	tab: { books: [], records: emptyRecords() },
	insights: { reading: [], rsvp: [] },
	settings: { wpm: 450, defaultReaderMode: "scroll" },
	milestones: { reached: [], next: [] },
	speedTests: [],
};
const sharedCards: ShareCardData[] = [];

function emptyRecords(): SpeedTabData["records"] {
	return { fastestSitting: null, fastestBook: null, bestRsvpSitting: null, longestRsvpRun: null };
}

vi.mock("../../../../../services/db/hooks", () => ({
	queryHooks: {
		useStatsSpeedModel: () => ({
			data: state.model,
			isError: modelError,
			isFetching: false,
			refetch,
		}),
		useStatsSpeedTab: () => ({ data: state.tab }),
		useStatsSpeedInsights: () => ({ data: state.insights }),
		useSettings: () => ({ data: state.settings }),
		useSaveSettings: () => ({ mutate }),
		useStatsMilestones: () => ({ data: state.milestones }),
		useSpeedTests: () => ({ data: state.speedTests }),
		useStatsPeriodTotals: () => ({ data: { minutes: 1260, words: 312_000, booksFinished: 7 } }),
		useStatsWpmTrend: () => ({
			data: {
				granularity: "day",
				measured: [
					{ bucketStart: 0, avgWpm: 240 },
					{ bucketStart: DAY, avgWpm: 260 },
				],
				rsvpTarget: [],
				averages: { measured: 250, rsvpTarget: 0 },
			},
		}),
	},
}));
vi.mock("../../wpm-trend", () => ({ WpmTrend: () => null }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));
vi.mock("../../../../../components/share-card/share-card-sheet", () => ({
	ShareCardSheet: ({ card }: { card: ShareCardData }) => {
		sharedCards.push(card);
		return <div data-testid="share-card-sheet" />;
	},
}));

const { SpeedTab } = await import("../speed-tab");

function model(
	over: { rsvp?: boolean; reading?: boolean; source?: "measured" | "test" | "default" } = {},
) {
	const reading = over.reading ?? true;
	const rsvp = over.rsvp ?? false;
	return {
		window: "recent",
		reading: {
			wpm: 260,
			source: over.source ?? "measured",
			scroll: reading ? { wpm: 250, words: 60_000, activeMs: 4 * HOUR } : null,
			page: reading ? { wpm: 300, words: 18_000, activeMs: HOUR } : null,
			words: reading ? 78_000 : 0,
			activeMs: reading ? 5 * HOUR : 0,
		},
		rsvp: rsvp
			? { wpm: 420, words: 50_400, activeMs: 2 * HOUR, dialWpm: 450, deliveredRatio: 0.92 }
			: null,
		pace: { wpm: 300, source: "measured" },
		modesUsed: { reading, rsvp },
		sittings: 12,
		books: {},
	} satisfies SpeedModel;
}

const bookRow = (i: number) => ({
	bookId: `b${i}`,
	title: `Book ${i}`,
	coverImage: null,
	mode: "scroll" as const,
	wpm: 240 + i,
	activeMs: HOUR,
	dialWpm: null,
	lastAt: i,
});

let view: Rendered | undefined;
beforeEach(() => {
	mutate.mockClear();
	navigate.mockClear();
	refetch.mockClear();
	modelError = false;
	state.speedTests = [];
	state.tab = { books: [], records: emptyRecords() };
	state.insights = { reading: [], rsvp: [] };
	state.settings = { wpm: 450, defaultReaderMode: "scroll" };
	state.milestones = { reached: [], next: [] };
	sharedCards.length = 0;
});
afterEach(() => {
	view?.unmount();
	view = undefined;
});

const text = () => view?.container.textContent ?? "";
const q = (id: string) => view?.container.querySelector(`[data-testid=${id}]`) ?? null;

describe("SpeedTab", () => {
	it("shows a never-RSVP reader their speed, trend, books and window, and nothing of RSVP", async () => {
		state.model = model();
		state.tab = {
			books: [bookRow(1)],
			records: { ...emptyRecords(), fastestBook: { wpm: 241, title: "Book 1" } },
		};
		view = await render(<SpeedTab now={2 * DAY} />);
		expect(q("speed-hero")?.textContent).toContain("260");
		expect(q("speed-hero")?.textContent).toContain("Scroll 250 · Page 300");
		expect(q("speed-hero")?.textContent).toContain("+20 since");
		expect(q("speed-hero")?.innerHTML).not.toMatch(/emerald|red-/);
		expect(q("speed-window")?.textContent).toContain("Last 10h");
		expect(q("book-speed-list")).not.toBeNull();
		expect(q("speed-records")?.textContent).toContain("Fastest book");
		expect(q("speed-records")?.textContent).toContain("241 wpm");
		expect(text()).not.toMatch(/RSVP|dial/i);
		expect(q("rsvp-dial")).toBeNull();
		expect(q("time-saved")).toBeNull();
		expect(view.container.querySelector("[data-testid=speed-mode]")).toBeNull();
	});

	it("shows an error with a retry when the speed model fails", async () => {
		state.model = undefined;
		modelError = true;
		view = await render(<SpeedTab now={2 * DAY} />);
		expect(q("speed-error")?.textContent).toContain("couldn't be worked out");
		await click(view.getButton("Try again"));
		expect(refetch).toHaveBeenCalledOnce();
	});

	it("offers the speed test and names it as the source of an unmeasured speed", async () => {
		state.model = model({ reading: false, source: "test" });
		view = await render(<SpeedTab now={2 * DAY} />);
		expect(q("speed-test-card")?.textContent).toContain("Not taken yet");
		expect(q("speed-hero")?.textContent).toContain("Speed test");
		state.speedTests = [{ id: "t1", readingWpm: 275, createdAt: DAY }];
		await view.rerender(<SpeedTab now={2 * DAY + 1} />);
		expect(q("speed-test-card")?.textContent).toContain("275 wpm");
		await click(view.getButton("Test my speed"));
		expect(navigate).toHaveBeenCalledWith({ to: "/speed-test" });
	});

	it("renders no insight grid while no insight has its data", async () => {
		state.model = model();
		view = await render(<SpeedTab now={2 * DAY} />);
		expect(q("speed-insights")).toBeNull();
	});

	it("shows each view's own insight tiles", async () => {
		state.model = model({ rsvp: true });
		state.insights = {
			reading: [
				{ id: "time-of-day", label: "Fastest time", value: "Evening", sub: "+8% · 262 wpm" },
			],
			rsvp: [{ id: "fatigue", label: "Slows after", value: "40m", sub: "−9%" }],
		};
		view = await render(<SpeedTab now={2 * DAY} />);
		expect(q("insight-time-of-day")?.textContent).toContain("Evening");
		expect(q("insight-fatigue")).toBeNull();
		const rsvpButton = [...view.container.querySelectorAll("[data-testid=speed-mode] button")].find(
			(b) => b.textContent?.includes("RSVP"),
		) as HTMLElement;
		await click(rsvpButton);
		expect(q("insight-fatigue")?.textContent).toContain("40m");
		expect(q("insight-time-of-day")).toBeNull();
	});

	it("switches between the modes when both were used", async () => {
		state.model = model({ rsvp: true });
		view = await render(<SpeedTab now={2 * DAY} />);
		const rsvpButton = [...view.container.querySelectorAll("[data-testid=speed-mode] button")].find(
			(b) => b.textContent?.includes("RSVP"),
		) as HTMLElement;
		expect(q("rsvp-dial")).toBeNull();
		await click(rsvpButton);
		expect(q("rsvp-dial")).not.toBeNull();
		expect(q("dial-line")?.textContent).toBe("Global dial 450 wpm, 92% delivered");
		expect(q("time-saved")?.textContent).toContain("50k words");
		expect(q("delivered-of-dial")?.textContent).toContain("92%");
	});

	it("opens on RSVP for an RSVP reader and hides time saved without a reading baseline", async () => {
		state.model = model({ rsvp: true, reading: false, source: "default" });
		view = await render(<SpeedTab now={2 * DAY} />);
		expect(q("rsvp-dial")).not.toBeNull();
		expect(q("time-saved")).toBeNull();
		expect(q("delivered-of-dial")).not.toBeNull();
	});

	it("shows the fastest book in the RSVP view too", async () => {
		state.model = model({ rsvp: true, reading: false, source: "default" });
		state.tab = {
			books: [],
			records: { ...emptyRecords(), fastestBook: { wpm: 393, title: "Fast RSVP Book" } },
		};
		view = await render(<SpeedTab now={2 * DAY} />);
		expect(q("rsvp-dial")).not.toBeNull();
		expect(q("speed-records")?.textContent).toContain("Fastest book");
		expect(q("speed-records")?.textContent).toContain("393 wpm");
		expect(q("speed-records")?.textContent).toContain("Fast RSVP Book");
	});

	it("steps the global dial", async () => {
		state.model = model({ rsvp: true, reading: false });
		view = await render(<SpeedTab now={2 * DAY} />);
		await click(view.container.querySelector("[aria-label='Dial +25']") as HTMLElement);
		expect(mutate).toHaveBeenCalledWith({ wpm: 475 });
	});

	it("saves the window the reader picks", async () => {
		state.model = model();
		view = await render(<SpeedTab now={2 * DAY} />);
		const trigger = q("speed-window") as HTMLElement;
		await act(async () => {
			trigger.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
		});
		const item = [...document.querySelectorAll("[role=menuitem]")].find(
			(el) => el.textContent === "30 days",
		) as HTMLElement;
		await click(item);
		expect(mutate).toHaveBeenCalledWith({ speedWindow: "30d" });
	});

	it("shows seven books, then all of them on request", async () => {
		state.model = model();
		state.tab = { books: Array.from({ length: 9 }, (_, i) => bookRow(i)), records: emptyRecords() };
		view = await render(<SpeedTab now={2 * DAY} />);
		expect(view.container.querySelectorAll("[data-testid=book-speed-row]")).toHaveLength(7);
		const more = [...view.container.querySelectorAll("button")].find(
			(b) => b.textContent === "Show all 9",
		) as HTMLElement;
		await click(more);
		expect(view.container.querySelectorAll("[data-testid=book-speed-row]")).toHaveLength(9);
	});

	it("lists reached milestones and the next ones with their progress", async () => {
		state.model = model();
		state.milestones = {
			reached: [
				{ kind: "words", threshold: 1_000_000, reachedAt: DAY },
				{ kind: "rsvpWpm", threshold: 500, reachedAt: DAY / 2 },
			],
			next: [{ kind: "words", threshold: 2_000_000, current: 1_200_000 }],
		};
		view = await render(<SpeedTab now={2 * DAY} />);
		const section = q("speed-milestones");
		// 1M is the third words tier and 500 the third RSVP tier: six of the 32 tiers.
		expect(section?.textContent).toContain("6 of 32");
		const medals = section?.querySelectorAll("[data-testid=milestone-medal]") ?? [];
		expect(
			[...medals].map((m) => (m.querySelector("[aria-label=RSVP]") ? "rsvp" : "plain")),
		).toEqual(["plain", "rsvp"]);
		expect(section?.querySelector("[data-testid=milestone-next]")?.textContent).toContain(
			"1.2M / 2M",
		);
	});

	it("hides the milestones while there are none", async () => {
		state.model = model();
		view = await render(<SpeedTab now={2 * DAY} />);
		expect(q("speed-milestones")).toBeNull();
	});

	it("shares a speed card with this year's numbers over the covers read", async () => {
		state.model = model({ rsvp: true });
		state.tab = {
			books: [{ ...bookRow(1), coverImage: "data:image/png;base64,AA" }, bookRow(2)],
			records: emptyRecords(),
		};
		view = await render(<SpeedTab now={2 * DAY} />);
		await click(q("share-speed-card") as HTMLElement);
		expect(q("share-card-sheet")).not.toBeNull();
		const card = sharedCards.at(-1);
		if (card?.kind !== "speed") throw new Error("speed card expected");
		expect(card.covers).toEqual(["data:image/png;base64,AA"]);
		expect(card.heroes.map((h) => [h.label, h.value])).toEqual([
			["Reading wpm", "260"],
			["RSVP wpm", "420"],
		]);
		expect(card.tiles.map((t) => t.label)).toEqual(["Read", "Books", "Saved"]);
		expect(card.tiles[0]?.value).toBe("21h");
	});
});
