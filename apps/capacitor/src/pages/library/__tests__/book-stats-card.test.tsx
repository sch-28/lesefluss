import { addDays } from "@lesefluss/core";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeBook } from "../../../test/book-fixture";
import { type Rendered, render } from "../../../test/render";
import { formatDayKey, localDateKey } from "../../../utils/date-utils";

const today = () => localDateKey(Date.now());
const hooks = {
	stats: { sessionCount: 0 } as unknown,
	goal: null as unknown,
};

vi.mock("../../../contexts/theme-context", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../../contexts/theme-context")>()),
	useTheme: () => ({ theme: "light", isEinkMode: false }),
}));
vi.mock("../../../services/db/hooks", () => ({
	queryHooks: {
		useStatsBook: () => ({ data: hooks.stats }),
		// No model: the 225 wpm stand-in, and RSVP at the dial times the default delivered ratio.
		useStatsSpeedModel: () => ({ data: undefined }),
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
		expect(view.text()).toContain("RSVP at 260 wpm: 1h 27m");
		// The headline is the only place the time left appears at the starting speed.
		expect(view.text().match(/1h 40m/g)).toHaveLength(1);
		expect(view.text()).not.toContain("estimated");
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
