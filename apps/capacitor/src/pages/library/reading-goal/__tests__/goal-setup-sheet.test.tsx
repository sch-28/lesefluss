import { afterEach, describe, expect, it, vi } from "vitest";
import { makeBook } from "../../../../test/book-fixture";
import { click, type Rendered, render } from "../../../../test/render";
import { at, makeGoal, makePlan, session } from "./goal-fixtures";

const mutation = { mutateAsync: vi.fn(), isPending: false };
const remove = {
	isPending: false,
	mutate: vi.fn((_vars: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.()),
};
const restore = { isPending: false, mutate: vi.fn() };
const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock("../../../../components/toast", () => ({ toast: { success: toastSuccess } }));

vi.mock("../../../../services/db/hooks", () => ({
	queryHooks: {
		useStatsSpeedModel: () => ({ data: undefined }),
		useSettings: () => ({ data: undefined }),
		useCreateReadingGoal: () => mutation,
		useReplanReadingGoal: () => mutation,
		useSetGoalReminder: () => mutation,
		useDeleteReadingGoal: () => remove,
		useRestoreReadingGoal: () => restore,
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

	it("removes the goal at once and offers an undo that writes it back", async () => {
		const goal = makeGoal();
		const plan = makePlan({ position: 100, sessions: [session(1, 0, 100)], now: at(2, 8) });
		const onClose = vi.fn();
		view = await render(
			<GoalSetupSheet
				isOpen
				onClose={onClose}
				book={makeBook()}
				wpm={250}
				existing={{ goal, plan }}
			/>,
		);
		const button = [...document.querySelectorAll("button")].find(
			(b) => b.textContent === "Remove goal",
		);
		if (!button) throw new Error("no Remove goal button");
		await click(button);

		expect(remove.mutate).toHaveBeenCalledWith({ id: goal.id }, expect.anything());
		expect(onClose).toHaveBeenCalled();
		expect(document.querySelector('[role="alertdialog"]')).toBeNull();
		const [text, options] = toastSuccess.mock.calls[0];
		expect(text).toBe("Goal removed");
		expect(options.action.label).toBe("Undo");
		options.action.onClick();
		expect(restore.mutate).toHaveBeenCalledWith({ goal });
	});
});
