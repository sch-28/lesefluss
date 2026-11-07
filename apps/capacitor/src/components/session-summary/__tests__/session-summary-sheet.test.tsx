import { computeSpeedModel, type SpeedModel, wordPos } from "@lesefluss/core";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionRow } from "../../../services/reading-sessions/rules";
import {
	CLOSE_SETTLE_MS,
	closeVisit,
	openVisit,
	recordSitting,
	resetSummaryStore,
} from "../../../services/reading-sessions/summary-store";
import { click, type Rendered, render } from "../../../test/render";

const saveSettings = vi.fn();
const modelWithout = vi.fn();
let model: SpeedModel | undefined;
const MIN = 60_000;
const settings = { showSessionSummary: true, speedWindow: "recent" };

vi.mock("../../../services/db/hooks", () => ({
	queryHooks: {
		useBook: () => ({ data: { id: "b1", title: "Morning Star", wordCount: 100_000 } }),
		useStatsSpeedModelWithout: (ids: string[]) => {
			modelWithout(ids);
			return { data: model };
		},
		useSettings: () => ({ data: settings }),
		useSaveSettings: () => ({ mutate: saveSettings }),
		useStatsPeriodTotals: () => ({ data: { minutes: 52, words: 0, booksFinished: 0 } }),
		useReadingGoalPlan: () => ({ data: null }),
		useStatsWpmTrend: () => ({ data: undefined }),
	},
}));
vi.mock("@lesefluss/ui/drawer", async () => {
	const { drawerModule } = await import("../../../test/overlay-mocks");
	return {
		...drawerModule,
		DrawerFooter: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
		drawerSnapPoints: (v: number[]) => v,
	};
});
vi.mock("@tanstack/react-router", () => ({
	Link: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock("../../book-cover", () => ({ default: () => null }));

const { SessionSummarySheet } = await import("../session-summary-sheet");

function sitting(durationMs: number, mode: SessionRow["mode"] = "scroll", wpm = 250): SessionRow {
	return {
		id: "s1",
		bookId: "b1",
		mode,
		startedAt: Date.now() - durationMs,
		endedAt: Date.now(),
		durationMs,
		wordsRead: Math.round((durationMs / MIN) * wpm),
		startWord: wordPos(41_000),
		endWord: wordPos(41_000 + Math.round((durationMs / MIN) * wpm)),
		furthestWord: null,
		wpmAvg: wpm,
		updatedAt: Date.now(),
	};
}

async function readAndClose(durationMs: number, row = sitting(durationMs)) {
	openVisit();
	recordSitting(row);
	closeVisit();
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, CLOSE_SETTLE_MS + 20));
	});
}

const sheet = () => document.querySelector("[data-testid=sheet]");

let view: Rendered | undefined;
beforeEach(() => {
	resetSummaryStore();
	saveSettings.mockClear();
	modelWithout.mockClear();
	model = undefined;
	settings.showSessionSummary = true;
});
afterEach(() => {
	view?.unmount();
	view = undefined;
});

describe("SessionSummarySheet", () => {
	it("opens with the sitting's stats after 2 minutes or more", async () => {
		view = await render(<SessionSummarySheet />);
		await readAndClose(34 * MIN);
		expect(sheet()?.textContent).toContain("Morning Star");
		expect(document.querySelector("[data-testid=summary-time]")?.textContent).toContain("34 min");
		expect(document.querySelector("[data-testid=summary-time]")?.textContent).toContain(
			"Today 52 min",
		);
		expect(document.querySelector("[data-testid=summary-words]")?.textContent).toContain("8,500");
		expect(document.querySelector("[data-testid=summary-speed]")?.textContent).toContain("250");
		expect(document.querySelector("[data-testid=summary-book]")?.textContent).toContain("41 → 50%");
	});

	it("compares the sitting with the speed from before it", async () => {
		const now = Date.now();
		model = computeSpeedModel(
			[{ mode: "scroll", startedAt: now - 86_400_000, durationMs: 60 * MIN, wordsRead: 60 * 200 }],
			{ now },
		);
		view = await render(<SessionSummarySheet />);
		await readAndClose(30 * MIN);
		expect(modelWithout).toHaveBeenLastCalledWith(["s1"]);
		expect(document.querySelector("[data-testid=summary-speed-delta]")?.textContent).toBe(
			"↑50 vs avg",
		);
	});

	it("shows an RSVP sitting's speed and the time it saved", async () => {
		const now = Date.now();
		model = computeSpeedModel(
			[{ mode: "scroll", startedAt: now - 86_400_000, durationMs: 60 * MIN, wordsRead: 60 * 200 }],
			{ now },
		);
		view = await render(<SessionSummarySheet />);
		await readAndClose(20 * MIN, sitting(20 * MIN, "rsvp", 400));
		expect(document.querySelector("[data-testid=summary-speed]")?.textContent).toContain(
			"RSVP speed",
		);
		const saved = document.querySelector("[data-testid=summary-time-saved]")?.textContent;
		expect(saved).toContain("Reading (200 wpm)");
		expect(saved).toContain("20m");
	});

	it("stays closed under 2 minutes", async () => {
		view = await render(<SessionSummarySheet />);
		await readAndClose(MIN + 59_000);
		expect(sheet()).toBeNull();
	});

	it("stays closed while the setting is off", async () => {
		settings.showSessionSummary = false;
		view = await render(<SessionSummarySheet />);
		await readAndClose(10 * MIN);
		expect(sheet()).toBeNull();
		settings.showSessionSummary = true;
		await view.rerender(<SessionSummarySheet />);
		expect(sheet()).toBeNull();
		await readAndClose(10 * MIN);
		expect(sheet()).not.toBeNull();
	});

	it("turns itself off with Don't show again", async () => {
		view = await render(<SessionSummarySheet />);
		await readAndClose(10 * MIN);
		await click(view.getButton("Don't show again"));
		expect(saveSettings).toHaveBeenCalledWith({ showSessionSummary: false });
		expect(sheet()).toBeNull();
	});

	it("closes on Done", async () => {
		view = await render(<SessionSummarySheet />);
		await readAndClose(10 * MIN);
		await click(view.getButton("Done"));
		expect(sheet()).toBeNull();
	});
});
