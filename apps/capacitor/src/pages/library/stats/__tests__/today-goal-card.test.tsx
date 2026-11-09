import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Book } from "../../../../services/db/schema";
import { click, type Rendered, render } from "../../../../test/render";
import { makeGoal, makePlan } from "../../reading-goal/__tests__/goal-fixtures";

const navigate = vi.fn();
let continueReading: { book: Book; open: () => void } | null = null;
let plans: unknown[] = [];
let streak: { current: number; longest: number; freezesBanked: number; frozenDays: string[] } = {
	current: 4,
	longest: 9,
	freezesBanked: 0,
	frozenDays: [],
};
const editSheet = vi.fn();

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));
vi.mock("../../../../hooks/use-continue-reading", () => ({
	useContinueReading: () => continueReading,
}));
vi.mock("../../../../services/db/hooks", () => ({
	queryHooks: {
		useActiveGoalPlans: () => ({ data: plans }),
		useStatsStreak: () => ({ data: streak, isPending: false }),
		useStatsDailyReading: () => ({ data: undefined, isPending: true }),
	},
}));
vi.mock("../../reading-goal/goal-sheet-for", () => ({
	GoalEditSheet: (props: { isOpen: boolean }) => {
		editSheet(props.isOpen);
		return null;
	},
	GoalSheetFor: () => null,
}));

const { TodayGoalCard, streakLine } = await import("../today-goal-card");

const entry = (id: string) => ({ goal: makeGoal({ id }), plan: makePlan({ position: 0 }) });
let rendered: Rendered;

beforeEach(() => {
	navigate.mockClear();
	editSheet.mockClear();
	continueReading = null;
	plans = [];
	streak = { current: 4, longest: 9, freezesBanked: 0, frozenDays: [] };
});

afterEach(() => rendered.unmount());

describe("TodayGoalCard", () => {
	it("shows today's ring and the streak, and edits the one goal on tap", async () => {
		plans = [entry("g1")];
		rendered = await render(<TodayGoalCard />);
		const card = rendered.getButton("Edit today's goal");
		expect(card.textContent).toMatch(/^Today \d+ of \d+ min4-day streak · best 9$/);
		await click(card);
		expect(editSheet).toHaveBeenLastCalledWith(true);
		expect(navigate).not.toHaveBeenCalled();
	});

	it("opens the goals page when there are several goals", async () => {
		plans = [entry("g1"), entry("g2")];
		rendered = await render(<TodayGoalCard />);
		await click(rendered.getButton("Reading goals"));
		expect(navigate).toHaveBeenCalledWith({ to: "/tabs/settings/goals" });
	});

	it("offers a goal for the book read last when none is set", async () => {
		continueReading = {
			book: { id: "b1", title: "Dune", seriesId: null, wordCount: 1000, wordPosition: 10 } as Book,
			open: vi.fn(),
		};
		streak = { current: 0, longest: 9, freezesBanked: 0, frozenDays: [] };
		rendered = await render(<TodayGoalCard />);
		expect(rendered.getButton("Set a reading goal for Dune").textContent).toBe(
			"Set a daily goalNo streak yet · best 9",
		);
	});

	it("keeps the streak and opens the goals page without a goal or a book to set one for", async () => {
		rendered = await render(<TodayGoalCard />);
		const card = rendered.getButton("Reading goals");
		expect(card.textContent).toBe("Set a daily goal4-day streak · best 9");
		await click(card);
		expect(navigate).toHaveBeenCalledWith({ to: "/tabs/settings/goals" });
	});

	it("opens the month calendar from its own button and back to the week", async () => {
		rendered = await render(<TodayGoalCard />);
		expect(rendered.container.querySelector('[data-testid="streak-week"]')).not.toBeNull();
		await click(rendered.getButton("Streak calendar"));
		expect(rendered.container.querySelector('[data-testid="streak-week"]')).toBeNull();
		expect(rendered.getButton("Previous month")).toBeTruthy();
		await click(rendered.getButton("Show current week"));
		expect(rendered.container.querySelector('[data-testid="streak-week"]')).not.toBeNull();
	});
});

describe("streakLine", () => {
	it("names the streak, the best and banked freezes", () => {
		expect(streakLine({ current: 193, longest: 193, freezesBanked: 0 })).toBe(
			"193-day streak · best 193",
		);
		expect(streakLine({ current: 0, longest: 5, freezesBanked: 1 })).toBe(
			"No streak yet · best 5 · 1 freeze",
		);
		expect(streakLine(undefined)).toBe("");
	});
});
