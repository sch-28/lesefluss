import { afterEach, describe, expect, it, vi } from "vitest";
import { makeBook } from "../../../../test/book-fixture";
import { type Rendered, render } from "../../../../test/render";

const mutation = { mutateAsync: vi.fn(), isPending: false };

vi.mock("../../../../services/db/hooks", () => ({
	queryHooks: {
		useStatsSpeedModel: () => ({ data: undefined }),
		useSettings: () => ({ data: undefined }),
		useCreateReadingGoal: () => mutation,
		useReplanReadingGoal: () => mutation,
		useSetGoalReminder: () => mutation,
		useDeleteReadingGoal: () => mutation,
	},
}));

const { GoalSetupSheet } = await import("../goal-setup-sheet");

function unitChip(name: string): HTMLButtonElement {
	const chips = document.querySelectorAll<HTMLButtonElement>('[data-testid="goal-unit"] button');
	const chip = [...chips].find((b) => b.textContent?.trim() === name);
	if (!chip) throw new Error(`No unit chip ${name}`);
	return chip;
}

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

describe("GoalSetupSheet", () => {
	it("starts a new goal with the % unit selected", async () => {
		view = await render(
			<GoalSetupSheet isOpen onClose={() => {}} book={makeBook()} wpm={250} existing={null} />,
		);
		expect(unitChip("% a day").getAttribute("aria-pressed")).toBe("true");
		expect(unitChip("Min a day").getAttribute("aria-pressed")).toBe("false");
	});
});
