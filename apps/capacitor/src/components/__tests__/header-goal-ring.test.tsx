import { afterEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../test/render";

const plans = vi.hoisted(() => ({ data: undefined as unknown[] | undefined }));

vi.mock("@tanstack/react-router", () => ({
	Link: ({ children, to: _to, ...props }: React.ComponentProps<"a"> & { to: string }) => (
		<a {...props}>{children}</a>
	),
}));
vi.mock("../../services/db/hooks", () => ({
	queryHooks: { useActiveGoalPlans: () => plans },
}));
vi.mock("../../services/stats/today-goal-summary", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../services/stats/today-goal-summary")>()),
	summarizeTodayGoals: () => ({
		kind: "goals",
		minutesRead: 5.6,
		minutesNeeded: 10.2,
		fraction: 0.55,
		isMet: false,
	}),
}));

const { HeaderGoalRing } = await import("../header-goal-ring");

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
	plans.data = undefined;
});

describe("HeaderGoalRing", () => {
	it("is a 44px gauge: a full track, the arc and the minutes read inside", async () => {
		plans.data = [];
		view = await render(<HeaderGoalRing />);
		const link = view.container.querySelector('[data-testid="header-goal-ring"]');
		expect(link?.getAttribute("aria-label")).toBe("Today's goal, 5 of 11 min");
		expect(link?.className).toContain("size-11");
		const circles = link?.querySelectorAll("circle") ?? [];
		expect(circles).toHaveLength(2);
		expect(circles[0]?.getAttribute("class")).toBe("stroke-muted-foreground/35");
		expect(link?.querySelector("svg")?.getAttribute("width")).toBe("36");
		expect(view.container.querySelector('[data-testid="header-goal-minutes"]')?.textContent).toBe(
			"5",
		);
	});

	it("holds its 44px box while the goals load", async () => {
		view = await render(<HeaderGoalRing />);
		expect(view.container.querySelector('[data-testid="header-goal-ring"]')).toBeNull();
		expect(view.container.querySelector("span.size-11")).not.toBeNull();
	});
});
