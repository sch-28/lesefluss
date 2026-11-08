import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Book } from "../../../../services/db/schema";
import { click, type Rendered, render } from "../../../../test/render";
import { makeGoal, makePlan } from "../../reading-goal/__tests__/goal-fixtures";

const navigate = vi.fn();
let continueReading: { book: Book; open: () => void } | null = null;
let plans: unknown[] = [];
const editSheet = vi.fn();

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));
vi.mock("../../../../hooks/use-continue-reading", () => ({
	useContinueReading: () => continueReading,
}));
vi.mock("../../../../services/db/hooks", () => ({
	queryHooks: { useActiveGoalPlans: () => ({ data: plans }) },
}));
vi.mock("../../reading-goal/goal-sheet-for", () => ({
	GoalEditSheet: (props: { isOpen: boolean }) => {
		editSheet(props.isOpen);
		return null;
	},
	GoalSheetFor: () => null,
}));

const { TodayGoalCard } = await import("../today-goal-card");

const entry = (id: string) => ({ goal: makeGoal({ id }), plan: makePlan({ position: 0 }) });
let rendered: Rendered;

beforeEach(() => {
	navigate.mockClear();
	editSheet.mockClear();
	continueReading = null;
	plans = [];
});

afterEach(() => rendered.unmount());

describe("TodayGoalCard", () => {
	it("shows today's ring and the streak, and edits the one goal on tap", async () => {
		plans = [entry("g1")];
		rendered = await render(<TodayGoalCard streak={4} />);
		const card = rendered.getButton("Edit today's goal");
		expect(card.textContent).toMatch(/^Today \d+ of \d+ min4-day streak$/);
		await click(card);
		expect(editSheet).toHaveBeenLastCalledWith(true);
		expect(navigate).not.toHaveBeenCalled();
	});

	it("opens the goals page when there are several goals", async () => {
		plans = [entry("g1"), entry("g2")];
		rendered = await render(<TodayGoalCard streak={0} />);
		await click(rendered.getButton("Reading goals"));
		expect(navigate).toHaveBeenCalledWith({ to: "/tabs/settings/goals" });
	});

	it("offers a goal for the book read last when none is set", async () => {
		continueReading = {
			book: { id: "b1", title: "Dune", seriesId: null, wordCount: 1000, wordPosition: 10 } as Book,
			open: vi.fn(),
		};
		rendered = await render(<TodayGoalCard streak={0} />);
		expect(rendered.getButton("Set a reading goal for Dune").textContent).toBe(
			"Set a daily goalfor Dune",
		);
	});

	it("renders nothing without a goal or a book to set one for", async () => {
		rendered = await render(<TodayGoalCard streak={3} />);
		expect(rendered.text()).toBe("");
	});
});
