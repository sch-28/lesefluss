import { computeSpeedModel, type Milestones, type SpeedModel, wordPos } from "@lesefluss/core";
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
import type { ShareCardData } from "../../../services/share-card/render";
import type { ReadingGoalPlan } from "../../../services/stats/reading-goal";
import { click, type Rendered, render } from "../../../test/render";

const saveSettings = vi.fn();
const modelWithout = vi.fn();
let model: SpeedModel | undefined;
let milestones: Milestones = { reached: [], next: [] };
const sharedCards: ShareCardData[] = [];
let goalPlan: { plan: Partial<ReadingGoalPlan> } | null = null;
let isTrendPending = false;
let isMilestonesFetching = false;
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
		useReadingGoalPlan: () => ({ data: goalPlan }),
		useStatsWpmTrend: () => ({ data: undefined, isPending: isTrendPending }),
		useStatsMilestones: () => ({ data: milestones, isFetching: isMilestonesFetching }),
		useBooks: () => ({
			data: { books: [], covers: new Map([["b1", "data:image/png;base64,AA"]]) },
		}),
	},
}));
vi.mock("../../share-card/share-card-sheet", () => ({
	ShareCardSheet: ({ card }: { card: ShareCardData }) => {
		sharedCards.push(card);
		return <div data-testid="share-card-sheet" />;
	},
}));
const drawerProps: Record<string, unknown>[] = [];
vi.mock("@lesefluss/ui/drawer", async () => {
	const { drawerModule } = await import("../../../test/overlay-mocks");
	return {
		...drawerModule,
		Drawer: (p: Parameters<typeof drawerModule.Drawer>[0]) => {
			drawerProps.push(p);
			return drawerModule.Drawer(p);
		},
		DrawerFooter: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
	};
});
const navigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));
vi.mock("@lesefluss/ui/dropdown-menu", () => {
	const Pass = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
	return {
		DropdownMenu: Pass,
		DropdownMenuTrigger: Pass,
		DropdownMenuContent: Pass,
		DropdownMenuItem: ({
			children,
			onSelect,
		}: {
			children?: React.ReactNode;
			onSelect: () => void;
		}) => (
			<button type="button" onClick={onSelect}>
				{children}
			</button>
		),
	};
});
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
		fontSize: null,
		segmentWpm: null,
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
	drawerProps.length = 0;
	saveSettings.mockClear();
	modelWithout.mockClear();
	model = undefined;
	milestones = { reached: [], next: [] };
	sharedCards.length = 0;
	settings.showSessionSummary = true;
	goalPlan = null;
	isTrendPending = false;
	isMilestonesFetching = false;
	navigate.mockClear();
});

function plan(over: Partial<ReadingGoalPlan>): { plan: Partial<ReadingGoalPlan> } {
	return {
		plan: {
			kind: "plan",
			isComplete: false,
			dailyMinutes: null,
			isTodayMet: false,
			projectedFinishDate: "2026-12-12",
			aheadBehind: { words: 0, percent: 0, days: 0 },
			progressToday: { words: 0, percent: 0, minutes: 0 },
			dailyTarget: { words: 0, percent: 0, minutes: 0 },
			...over,
		},
	};
}
afterEach(() => {
	view?.unmount();
	view = undefined;
});

describe("SessionSummarySheet", () => {
	it("opens with the sitting's stats after a minute or more", async () => {
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

	it("opens at its full height, with no partial snap", async () => {
		view = await render(<SessionSummarySheet />);
		await readAndClose(10 * MIN);
		const opened = drawerProps.filter((p) => p.open);
		expect(opened.length).toBeGreaterThan(0);
		for (const p of opened) {
			expect(p.snapPoints).toBeUndefined();
			expect(p.activeSnapPoint).toBeUndefined();
		}
	});

	it("stays closed under a minute", async () => {
		view = await render(<SessionSummarySheet />);
		await readAndClose(59_000);
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

	it("shows a milestone the visit reached, and none from before it", async () => {
		milestones = {
			reached: [
				{ kind: "words", threshold: 1_000_000, reachedAt: Date.now() - 5 * MIN },
				{ kind: "streak", threshold: 7, reachedAt: Date.now() - 3 * 86_400_000 },
			],
			next: [],
		};
		view = await render(<SessionSummarySheet />);
		await readAndClose(10 * MIN);
		const medals = document.querySelectorAll(
			"[data-testid=summary-milestones] [data-testid=milestone-medal]",
		);
		expect(medals).toHaveLength(1);
		expect(medals[0]?.textContent).toContain("1M");
	});

	it("shares a card with the cover, the title and the sitting's stats", async () => {
		milestones = {
			reached: [{ kind: "words", threshold: 1_000_000, reachedAt: Date.now() - 5 * MIN }],
			next: [],
		};
		view = await render(<SessionSummarySheet />);
		await readAndClose(34 * MIN);
		await click(view.getButton("Share card"));
		expect(document.querySelector("[data-testid=share-card-sheet]")).not.toBeNull();
		const card = sharedCards.at(-1);
		expect(card).toMatchObject({
			kind: "book",
			title: "Morning Star",
			cover: "data:image/png;base64,AA",
			hero: "34m",
		});
		if (card?.kind !== "book") throw new Error("book card expected");
		expect(card.tiles.map((t) => [t.label, t.value])).toEqual([
			["wpm", "250"],
			["Words", "8.5k"],
			["Book", "+8.5%"],
			["words", "1M"],
		]);
	});

	it("waits for every figure before it opens", async () => {
		isTrendPending = true;
		view = await render(<SessionSummarySheet />);
		await readAndClose(10 * MIN);
		expect(sheet()).toBeNull();
		isTrendPending = false;
		await view.rerender(<SessionSummarySheet />);
		expect(document.querySelector("[data-testid=summary-time]")?.textContent).toContain("10 min");
	});

	it("waits for a stale figure to refetch, then stays open through later refetches", async () => {
		isMilestonesFetching = true;
		view = await render(<SessionSummarySheet />);
		await readAndClose(10 * MIN);
		expect(sheet()).toBeNull();
		isMilestonesFetching = false;
		await view.rerender(<SessionSummarySheet />);
		expect(sheet()).not.toBeNull();
		isMilestonesFetching = true;
		await view.rerender(<SessionSummarySheet />);
		expect(sheet()).not.toBeNull();
	});

	it("shows a minute goal as a met goal row, and the Time tile without a goal bar", async () => {
		goalPlan = plan({
			dailyMinutes: 11,
			isTodayMet: true,
			progressToday: { words: 0, percent: 0, minutes: 15.4 },
		});
		view = await render(<SessionSummarySheet />);
		await readAndClose(15 * MIN);
		const row = document.querySelector("[data-testid=summary-goal]");
		expect(row?.textContent).toBe("Today 15 / 11 minMet");
		expect(row?.getAttribute("data-met")).toBe("true");
		expect(document.querySelector("[data-testid=summary-time]")?.textContent).toBe(
			"Time15 minToday 52 min",
		);
	});

	it("shows a percent goal's progress and its pace", async () => {
		goalPlan = plan({
			isTodayMet: true,
			progressToday: { words: 0, percent: 3.3, minutes: 0 },
			dailyTarget: { words: 0, percent: 3.3, minutes: 0 },
		});
		view = await render(<SessionSummarySheet />);
		await readAndClose(10 * MIN);
		expect(document.querySelector("[data-testid=summary-goal]")?.textContent).toMatch(
			/^3\.3% \/ 3\.3% today · on track .+Met$/,
		);
	});

	it("opens the Speed tab from the speed tile", async () => {
		view = await render(<SessionSummarySheet />);
		await readAndClose(10 * MIN);
		const tile = document.querySelector("[data-testid=summary-speed]");
		if (!(tile instanceof HTMLButtonElement)) throw new Error("speed tile is no button");
		await click(tile);
		expect(navigate).toHaveBeenCalledWith({ to: "/tabs/stats", search: { tab: "speed" } });
		expect(sheet()).toBeNull();
	});

	it("keeps only Share card and Done in the footer", async () => {
		view = await render(<SessionSummarySheet />);
		await readAndClose(10 * MIN);
		expect(view.getButton("Share card")).toBeTruthy();
		expect(view.getButton("Done")).toBeTruthy();
		expect(sheet()?.textContent).not.toContain("Speed tab");
	});
});
