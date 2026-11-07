import type { SpeedModel } from "@lesefluss/core";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SpeedTabData } from "../../../../../services/stats/speed-tab";
import { click, type Rendered, render } from "../../../../../test/render";

const mutate = vi.fn();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const state: {
	model: SpeedModel | undefined;
	tab: SpeedTabData;
	settings: { wpm: number; defaultReaderMode: string };
} = {
	model: undefined,
	tab: { books: [], records: emptyRecords() },
	settings: { wpm: 450, defaultReaderMode: "scroll" },
};

function emptyRecords(): SpeedTabData["records"] {
	return { fastestSitting: null, fastestBook: null, bestRsvpSitting: null, longestRsvpRun: null };
}

vi.mock("../../../../../services/db/hooks", () => ({
	queryHooks: {
		useStatsSpeedModel: () => ({ data: state.model }),
		useStatsSpeedTab: () => ({ data: state.tab }),
		useSettings: () => ({ data: state.settings }),
		useSaveSettings: () => ({ mutate }),
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

const { SpeedTab } = await import("../speed-tab");

function model(over: { rsvp?: boolean; reading?: boolean; source?: "measured" | "default" } = {}) {
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
	state.tab = { books: [], records: emptyRecords() };
	state.settings = { wpm: 450, defaultReaderMode: "scroll" };
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
		expect(q("speed-window")?.textContent).toContain("Recent 10h");
		expect(q("book-speed-list")).not.toBeNull();
		expect(q("speed-records")).not.toBeNull();
		expect(text()).not.toMatch(/RSVP|dial/i);
		expect(q("rsvp-dial")).toBeNull();
		expect(q("time-saved")).toBeNull();
		expect(view.container.querySelector("[data-testid=speed-mode]")).toBeNull();
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
});
