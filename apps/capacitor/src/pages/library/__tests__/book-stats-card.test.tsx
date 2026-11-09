import { addDays, wordPos } from "@lesefluss/core";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeBook } from "../../../test/book-fixture";
import { type Rendered, render } from "../../../test/render";
import { formatDayKey, localDateKey } from "../../../utils/date-utils";

const today = () => localDateKey(Date.now());
const hooks = {
	stats: { sessionCount: 0 } as unknown,
	goal: null as unknown,
	model: undefined as unknown,
};

vi.mock("../../../contexts/theme-context", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../../contexts/theme-context")>()),
	useTheme: () => ({ theme: "light", isEinkMode: false }),
}));
vi.mock("../../../services/db/hooks", () => ({
	queryHooks: {
		useStatsBook: () => ({ data: hooks.stats }),
		// No model by default: the 225 wpm stand-in pace, and RSVP falls back to the setting.
		useStatsSpeedModel: () => ({ data: hooks.model }),
		useSettings: () => ({ data: { wpm: 400 } }),
		useReadingGoalPlan: () => ({ data: hooks.goal }),
		useStatsDailyReading: () => ({ data: { msByDay: new Map([[today(), 25 * 60_000]]) } }),
	},
}));

const { BookStatsCard } = await import("../book-stats-card");

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
	hooks.goal = null;
	hooks.model = undefined;
	hooks.stats = { sessionCount: 0 };
});

async function pressOnSlider(key: string) {
	const thumb = view?.container.querySelector<HTMLElement>("[role=slider]");
	if (!thumb) throw new Error("no slider");
	await act(async () => {
		thumb.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
	});
}

const result = () => view?.container.querySelector("[data-testid=what-if-result]")?.textContent;

describe("BookStatsCard before the first sitting", () => {
	it("shows an unread book's total time at the pace", async () => {
		view = await render(<BookStatsCard book={makeBook({ wordCount: 22_500 })} />);
		expect(view.container.querySelector("[data-testid=book-reading-time]")?.textContent).toContain(
			"1h 40mtotal",
		);
		expect(view.text()).toContain("RSVP at 400 wpm (your setting): 56 min");
		// The headline is the only place the time left appears at the starting speed.
		expect(view.text().match(/1h 40m/g)).toHaveLength(1);
		expect(view.text()).not.toContain("estimated");
	});

	it("times RSVP at the measured RSVP speed, labelled with it", async () => {
		hooks.model = {
			pace: { wpm: 225, source: "default" },
			books: {},
			rsvp: { wpm: 450, words: 9000, activeMs: 20 * 60_000, dialWpm: 500, deliveredRatio: 0.9 },
		};
		view = await render(<BookStatsCard book={makeBook({ wordCount: 22_500 })} />);
		expect(view.container.querySelector("[data-testid=rsvp-hint]")?.textContent).toBe(
			"RSVP at 450 wpm (your speed): 50 min",
		);
	});

	it("hides the RSVP line when it is not faster than the pace", async () => {
		hooks.model = {
			pace: { wpm: 500, source: "measured" },
			books: {},
			rsvp: { wpm: 450, words: 9000, activeMs: 20 * 60_000, dialWpm: 500, deliveredRatio: 0.9 },
		};
		view = await render(<BookStatsCard book={makeBook({ wordCount: 22_500 })} />);
		expect(view.container.querySelector("[data-testid=rsvp-hint]")).toBeNull();
	});

	it("moves time left and the finish day with the what-if speed", async () => {
		view = await render(<BookStatsCard book={makeBook({ wordCount: 22_500 })} />);
		expect(result()).toBe(`Done ${formatDayKey(addDays(today(), 3))}`);
		await pressOnSlider("End");
		expect(view.container.querySelector("[data-testid=what-if-wpm]")?.textContent).toBe("1000 wpm");
		expect(result()).toBe(`Left 23 min · Done ${formatDayKey(today())}`);
	});

	it("projects the finish with a minute goal's daily minutes", async () => {
		hooks.goal = { goal: { mode: "pace", dailyMinutes: 10 } };
		view = await render(<BookStatsCard book={makeBook({ wordCount: 22_500 })} />);
		expect(result()).toBe(`Done ${formatDayKey(addDays(today(), 9))}`);
	});

	it("ignores minutes left on a goal that is no longer a pace goal", async () => {
		hooks.goal = { goal: { mode: "deadline", dailyMinutes: 10 } };
		view = await render(<BookStatsCard book={makeBook({ wordCount: 22_500 })} />);
		expect(result()).toBe(`Done ${formatDayKey(addDays(today(), 3))}`);
	});

	it("shows nothing for a book of unknown length", async () => {
		view = await render(<BookStatsCard book={makeBook({ wordCount: 0 })} />);
		expect(view.text()).toBe("");
	});
});

// 22,500 words at the 225 wpm stand-in pace: 1h 40m in all, 50 min left halfway.
describe("BookStatsCard on a started book", () => {
	const halfway = () => makeBook({ wordCount: 22_500, wordPosition: wordPos(11_250) });

	it("shows no card before the first sitting", async () => {
		view = await render(<BookStatsCard book={halfway()} />);
		expect(view.text()).toBe("");
	});

	it("leaves the time left to the Continue button after sittings", async () => {
		hooks.stats = {
			sessionCount: 3,
			totalDurationMs: 30 * 60_000,
			measuredWpm: null,
			dominantMode: null,
			speedSeries: [],
		};
		view = await render(<BookStatsCard book={halfway()} />);
		expect(view.text()).toContain("time read");
		expect(view.text()).not.toContain("50 min");
		expect(view.text()).not.toMatch(/\bleft\b/i);
	});
});

describe("BookStatsCard on a reset book", () => {
	it("shows the total next to the kept sittings, since Start reading carries no time", async () => {
		hooks.stats = {
			sessionCount: 3,
			totalDurationMs: 30 * 60_000,
			measuredWpm: null,
			dominantMode: null,
			speedSeries: [],
		};
		view = await render(<BookStatsCard book={makeBook({ wordCount: 22_500 })} />);
		expect(view.text()).toContain("time read");
		expect(view.text().match(/1h 40m/g)).toHaveLength(1);
		expect(view.text()).toContain("1h 40mtotal");
	});
});
