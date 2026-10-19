import { wordPos } from "@lesefluss/core";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReadingGoal } from "../../../services/db/schema";
import { makeBook } from "../../../test/book-fixture";
import { type Rendered, render } from "../../../test/render";

const goal: { current: Partial<ReadingGoal> | null } = { current: null };
const mutate = vi.fn();
vi.mock("@/services/db/hooks", () => ({
	queryHooks: {
		useReadingGoalPlan: () => ({
			data: goal.current ? { goal: goal.current } : null,
			isPending: false,
		}),
		useCreateReadingGoal: () => ({ mutate, isPending: false }),
	},
}));

const { adoptState, BuddyReadDeadline } = await import("../buddy-read-deadline");

// Noon keeps the local day the same in every time zone the tests may run in.
const DEADLINE = new Date(2036, 11, 18, 12).getTime();
const DEADLINE_KEY = "2036-12-18";

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
	goal.current = null;
	vi.clearAllMocks();
});

const props = (overrides: Partial<Parameters<typeof BuddyReadDeadline>[0]> = {}) => ({
	targetDate: DEADLINE,
	onPace: null,
	isHost: false,
	isOffline: false,
	myBook: makeBook(),
	onSetTarget: vi.fn(),
	isSettingTarget: false,
	onConfirmReplace: vi.fn(),
	onError: vi.fn(),
	...overrides,
});

async function clickAdopt(v: Rendered) {
	await act(async () => {
		v.getButton(/Adopt/).click();
	});
}

describe("adoptState", () => {
	const book = makeBook();
	const TODAY = "2026-11-01";
	const state = (over: Partial<Parameters<typeof adoptState>[0]> = {}) =>
		adoptState({
			book,
			goal: null,
			goalLoaded: true,
			deadline: DEADLINE_KEY,
			today: TODAY,
			...over,
		});

	it("adopts on a book without a goal and replaces another active goal", () => {
		expect(state()).toBe("adopt");
		expect(
			state({ goal: { status: "abandoned", mode: "deadline", targetDate: DEADLINE_KEY } }),
		).toBe("adopt");
		expect(state({ goal: { status: "active", mode: "pace", targetDate: DEADLINE_KEY } })).toBe(
			"replace",
		);
		expect(state({ goal: { status: "active", mode: "deadline", targetDate: "2026-12-01" } })).toBe(
			"replace",
		);
	});

	it("is done once the member's goal already is this deadline", () => {
		expect(state({ goal: { status: "active", mode: "deadline", targetDate: DEADLINE_KEY } })).toBe(
			"adopted",
		);
	});

	it("is not offered without a local copy, for a finished book or an unknown length", () => {
		expect(state({ book: null })).toBe("unavailable");
		expect(state({ book: makeBook({ wordPosition: wordPos(990) }) })).toBe("unavailable");
		expect(state({ book: makeBook({ wordCount: 0 }) })).toBe("unavailable");
	});

	it("is not offered once the deadline has passed; today itself still counts", () => {
		expect(state({ today: "2036-12-19" })).toBe("unavailable");
		expect(state({ today: DEADLINE_KEY })).toBe("adopt");
	});

	it("offers nothing until the member's own goal has loaded, so replacing always asks", () => {
		expect(state({ goalLoaded: false })).toBe("unavailable");
	});
});

describe("BuddyReadDeadline", () => {
	it("shows a member the date and adopts it as a deadline goal in one tap", async () => {
		view = await render(<BuddyReadDeadline {...props()} />);
		expect(view.text()).toContain("by");
		expect(view.container.querySelector('input[type="date"]')).toBeNull();
		await clickAdopt(view);
		expect(mutate).toHaveBeenCalledWith(
			{
				book: expect.objectContaining({ id: "deadbeef" }),
				spec: { mode: "deadline", targetDate: DEADLINE_KEY },
				reminderTime: null,
			},
			expect.anything(),
		);
	});

	it("asks before replacing the member's own goal", async () => {
		goal.current = { status: "active", mode: "pace", targetDate: "2027-01-31" };
		const onConfirmReplace = vi.fn();
		view = await render(<BuddyReadDeadline {...props({ onConfirmReplace })} />);
		await clickAdopt(view);
		expect(mutate).not.toHaveBeenCalled();
		expect(onConfirmReplace).toHaveBeenCalledOnce();
		onConfirmReplace.mock.calls[0]?.[0]();
		expect(mutate).toHaveBeenCalledOnce();
	});

	it("marks a deadline already adopted and drops the group pace, which could contradict the goal", async () => {
		goal.current = { status: "active", mode: "deadline", targetDate: DEADLINE_KEY };
		view = await render(<BuddyReadDeadline {...props({ onPace: false })} />);
		expect(view.text()).toContain("my goal");
		expect(view.text()).not.toContain("behind");
		expect(view.queryButton(/Adopt/)).toBeNull();
	});

	it("shows the group pace beside the date until the member adopts it", async () => {
		view = await render(<BuddyReadDeadline {...props({ onPace: true })} />);
		expect(view.text()).toContain("on track");
	});

	it("says a passed deadline has passed and offers no adopt", async () => {
		view = await render(
			<BuddyReadDeadline
				{...props({ targetDate: new Date(2020, 0, 5, 12).getTime(), onPace: false })}
			/>,
		);
		expect(view.text()).toContain("passed");
		expect(view.text()).not.toContain("behind");
		expect(view.queryButton(/Adopt/)).toBeNull();
	});

	it("lets the host edit the date, and hides the section from members until there is one", async () => {
		view = await render(<BuddyReadDeadline {...props({ isHost: true })} />);
		expect(view.container.querySelector<HTMLInputElement>('input[type="date"]')?.value).toBe(
			DEADLINE_KEY,
		);
		expect(view.queryButton("Clear")).not.toBeNull();
		view.unmount();

		view = await render(<BuddyReadDeadline {...props({ targetDate: null })} />);
		expect(view.text()).toBe("");
	});
});
