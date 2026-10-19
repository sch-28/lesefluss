import { wordPos } from "@lesefluss/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReadingGoal } from "../../../../services/db/schema";
import type { ReadingGoalPlan } from "../../../../services/stats/reading-goal";
import { makeBook } from "../../../../test/book-fixture";
import { type Rendered, render } from "../../../../test/render";
import { at, makeGoal, makePlan, session } from "./goal-fixtures";

const goalData: { current: { goal: ReadingGoal; plan: ReadingGoalPlan } | null } = {
	current: null,
};

vi.mock("../../../../services/db/hooks", () => ({
	queryHooks: {
		useReadingGoalPlan: () => ({ data: goalData.current, isPending: false }),
		useStatsBook: () => ({ data: undefined }),
		useStatsMeasuredSpeed: () => ({ data: undefined }),
	},
}));
vi.mock("../goal-chart", () => ({ GoalChart: () => <div data-testid="goal-chart" /> }));
vi.mock("../goal-setup-sheet", () => ({ GoalSetupSheet: () => null }));

const { GoalCard } = await import("../goal-card");
const { GoalChip } = await import("../../../reader/goal-chip");
const { liveToday } = await import("../goal-model");

const BEHIND = ".text-\\[var\\(--goal-pending\\)\\]";
const AHEAD = ".text-\\[var\\(--goal-met\\)\\]";

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
	goalData.current = null;
});

describe("GoalCard", () => {
	it("offers to set a goal on a book without one", async () => {
		view = await render(<GoalCard book={makeBook()} />);
		expect(view.queryButton(/Set goal/)).not.toBeNull();
	});

	it("is not offered for serial chapters or finished books", async () => {
		view = await render(<GoalCard book={makeBook({ seriesId: "s" })} />);
		expect(view.text()).toBe("");
		view.unmount();
		view = await render(<GoalCard book={makeBook({ wordPosition: wordPos(980) })} />);
		expect(view.text()).toBe("");
	});

	it("shows today's target, the plan gap, both counters and the chart", async () => {
		const plan = makePlan({
			position: 150,
			sessions: [session(1, 0, 100), session(3, 100, 150)],
			now: at(3, 21),
		});
		goalData.current = { goal: makeGoal(), plan };
		view = await render(<GoalCard book={makeBook({ wordPosition: wordPos(150) })} />);
		const text = view.text();
		expect(text).toContain("Goal · by");
		expect(text).toMatch(/5\.0 \/ 11\.3%/);
		expect(text).toContain("today ·");
		expect(text).toContain("−5.0%");
		expect(text).toContain("vs plan · −0.5 d");
		expect(text).toContain("1 d daydays met");
		expect(text).toContain("2 d daysdays read");
		expect(text).toContain("Missed day: raise daily target");
		expect(view.container.querySelector('[data-testid="goal-chart"]')).not.toBeNull();
		expect(view.container.querySelector(BEHIND)).not.toBeNull();
	});

	it("shows an even plan gap without a tone when on track", async () => {
		const plan = makePlan({ position: 100, sessions: [session(1, 0, 100)], now: at(2, 8) });
		goalData.current = { goal: makeGoal(), plan };
		view = await render(<GoalCard book={makeBook({ wordPosition: wordPos(100) })} />);
		expect(view.text()).toContain("0.0%vs plan · 0.0 d");
		expect(view.container.querySelector(BEHIND)).toBeNull();
		expect(view.container.querySelector(AHEAD)).toBeNull();
	});

	it("colours an ahead plan gap as met", async () => {
		const plan = makePlan({ position: 400, sessions: [session(1, 0, 400)], now: at(2, 8) });
		goalData.current = { goal: makeGoal(), plan };
		view = await render(<GoalCard book={makeBook({ wordPosition: wordPos(400) })} />);
		expect(view.text()).toContain("+20.0%");
		expect(view.container.querySelector(AHEAD)).not.toBeNull();
	});

	it("marks a completed goal as done without a daily target", async () => {
		const goal = makeGoal({ status: "completed", completedAt: at(4) });
		goalData.current = { goal, plan: makePlan({ goal, position: 960, now: at(5) }) };
		view = await render(<GoalCard book={makeBook({ wordPosition: wordPos(960) })} />);
		expect(view.text()).toContain("Done");
		expect(view.text()).toContain("Goal · done");
		expect(view.text()).not.toContain("vs plan");
		expect(view.queryButton("Edit")).toBeNull();
	});
});

describe("GoalChip", () => {
	it("shows today's progress and turns met once the live position passes the target", async () => {
		const plan = makePlan({ position: 0, now: at(1, 13) });
		view = await render(
			<GoalChip plan={plan} today={liveToday(plan, 40, 1000)} onOpenDetails={() => {}} />,
		);
		const chip = view.container.querySelector('[data-testid="goal-chip"]');
		expect(chip?.getAttribute("data-met")).toBe("false");
		expect(chip?.textContent).toBe("4.0/ 10.0%");

		await view.rerender(
			<GoalChip plan={plan} today={liveToday(plan, 120, 1000)} onOpenDetails={() => {}} />,
		);
		expect(chip?.getAttribute("data-met")).toBe("true");
		expect(chip?.getAttribute("aria-label")).toBe("Today's target met: 10.0%");
	});
});
