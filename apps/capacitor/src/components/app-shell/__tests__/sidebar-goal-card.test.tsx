import { wordPos } from "@lesefluss/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Book } from "../../../services/db/schema";
import type { ReadingGoalPlanResult } from "../../../services/stats/reading-goal";
import { type Rendered, render } from "../../../test/render";

let continueReading: { book: Book; open: () => void } | null = null;
let plans: { plan: ReadingGoalPlanResult }[] = [];
let streakDays = 0;

vi.mock("../../../hooks/use-continue-reading", () => ({
	useContinueReading: () => continueReading,
}));
vi.mock("../../../services/db/hooks", () => ({
	queryHooks: {
		useActiveGoalPlans: () => ({ data: plans }),
		useStatsStreak: () => ({ data: { current: streakDays } }),
		useStatsSpeedModel: () => ({ data: undefined }),
	},
}));
vi.mock("../../../pages/library/reading-goal/goal-setup-sheet", () => ({
	GoalSetupSheet: () => null,
}));

const { SidebarGoalCard } = await import("../sidebar-goal-card");

function book(overrides: Partial<Book> = {}): Book {
	return {
		id: "b1",
		title: "Dune",
		seriesId: null,
		wordCount: 1000,
		wordPosition: 100,
		deleted: false,
		...overrides,
	} as Book;
}

const activePlan = {
	plan: {
		kind: "plan",
		isComplete: false,
		isTodayMet: false,
		dailyMinutes: 30,
		dailyTarget: { minutes: 30 },
		progressToday: { minutes: 19 },
	},
} as unknown as { plan: ReadingGoalPlanResult };

let rendered: Rendered;

beforeEach(() => {
	continueReading = null;
	plans = [];
	streakDays = 12;
});

afterEach(() => rendered.unmount());

describe("SidebarGoalCard", () => {
	it("shows the streak when no book was read yet", async () => {
		rendered = await render(<SidebarGoalCard isCollapsed={false} />);
		expect(rendered.text()).toBe("12-day streak");
		expect(rendered.container.querySelector("button")).toBeNull();
	});

	it("shows the streak and continues the book when it can't take a goal", async () => {
		const open = vi.fn();
		continueReading = { book: book({ wordPosition: wordPos(1000) }), open };
		rendered = await render(<SidebarGoalCard isCollapsed={false} />);
		expect(rendered.text()).toBe("12-day streak");
		rendered.getButton("Continue Dune").click();
		expect(open).toHaveBeenCalledOnce();
	});

	it("offers a goal for a book that can take one", async () => {
		continueReading = { book: book(), open: vi.fn() };
		rendered = await render(<SidebarGoalCard isCollapsed={false} />);
		expect(rendered.getButton("Set a reading goal for Dune").textContent).toBe(
			"Set a goal12-day streak",
		);
	});

	it("shows the goal minutes and continues the book when both exist", async () => {
		const open = vi.fn();
		plans = [activePlan];
		continueReading = { book: book(), open };
		rendered = await render(<SidebarGoalCard isCollapsed={false} />);
		const card = rendered.getButton("Continue Dune");
		expect(card.textContent).toBe("19 of 30 min12-day streak");
		card.click();
		expect(open).toHaveBeenCalledOnce();
	});

	it("keeps only the ring of the goal card when collapsed", async () => {
		plans = [activePlan];
		continueReading = { book: book(), open: vi.fn() };
		rendered = await render(<SidebarGoalCard isCollapsed />);
		expect(rendered.getButton("Continue Dune: 19 of 30 min").textContent).toBe("");
	});

	it("shows today's goal minutes even with no book to continue", async () => {
		plans = [activePlan];
		rendered = await render(<SidebarGoalCard isCollapsed={false} />);
		expect(rendered.text()).toBe("19 of 30 min12-day streak");
		expect(rendered.container.querySelector("button")).toBeNull();
	});

	it("names the streak when collapsed", async () => {
		streakDays = 0;
		rendered = await render(<SidebarGoalCard isCollapsed />);
		expect(rendered.container.querySelector(".sr-only")?.textContent).toBe("No streak yet");
		expect(rendered.container.querySelector("button")).toBeNull();
	});
});
