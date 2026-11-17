import { wordPos } from "@lesefluss/core";
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
const hookState = vi.hoisted(() => ({
	rsvpWpm: null as number | null,
	settingWpm: null as number | null,
	sessions: undefined as { startedAt: number; startWord: number }[] | undefined,
}));
const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock("../../../../components/toast", () => ({ toast: { success: toastSuccess } }));

vi.mock("../../../../services/db/hooks", () => ({
	queryHooks: {
		useStatsSpeedModel: () => ({
			data: hookState.rsvpWpm === null ? undefined : { rsvp: { wpm: hookState.rsvpWpm } },
		}),
		useSettings: () => ({
			data: hookState.settingWpm === null ? undefined : { wpm: hookState.settingWpm },
		}),
		useBookReadingSessions: () => ({ data: hookState.sessions }),
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
	hookState.rsvpWpm = null;
	hookState.settingWpm = null;
	hookState.sessions = undefined;
	vi.useRealTimers();
});

const sheetText = () => document.body.textContent ?? "";

describe("GoalSetupSheet", () => {
	it("starts a new goal with the % unit selected", async () => {
		view = await render(
			<GoalSetupSheet isOpen onClose={() => {}} book={makeBook()} wpm={250} existing={null} />,
		);
		expect(unitChip("% a day").getAttribute("aria-pressed")).toBe("true");
		expect(unitChip("Min a day").getAttribute("aria-pressed")).toBe("false");
	});

	it("says what a missed day does for the value the reader keeps", async () => {
		view = await render(
			<GoalSetupSheet isOpen onClose={() => {}} book={makeBook()} wpm={250} existing={null} />,
		);
		const missedDay = () => document.querySelector('[data-testid="goal-missed-day"]')?.textContent;
		expect(missedDay()).toContain("the daily target goes up");
		const keepDaily = document.querySelector<HTMLButtonElement>(
			'button[aria-label$="Keep daily amount"]',
		);
		if (!keepDaily) throw new Error("No Keep daily amount card");
		await click(keepDaily);
		expect(missedDay()).toContain("the finish date moves back");
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
		// The quiet red text action under Save goal, as in 2.2.0, not a filled button beside it.
		expect(button.dataset.variant).toBe("ghost");
		expect(button.className).toContain("text-destructive");
		expect(button.previousElementSibling?.textContent).toBe("Save goal");
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

	it("measures a new goal from where today's reading began, as the plan on the card will", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(at(1, 12));
		const book = makeBook({ wordCount: 100_000, wordPosition: wordPos(50_000) });
		view = await render(
			<GoalSetupSheet isOpen onClose={() => {}} book={book} wpm={250} existing={null} />,
		);
		const withoutToday = sheetText();
		view.unmount();

		hookState.sessions = [{ startedAt: at(1, 8), startWord: 10_000 }];
		view = await render(
			<GoalSetupSheet isOpen onClose={() => {}} book={book} wpm={250} existing={null} />,
		);
		// 90% left instead of 50% over the same days: the shown daily share grows.
		expect(sheetText()).not.toBe(withoutToday);
	});

	it("shows the measured RSVP speed, the one the book page shows, over the dial setting", async () => {
		hookState.rsvpWpm = 333;
		hookState.settingWpm = 500;
		const book = makeBook({ wordCount: 100_000, wordPosition: wordPos(0) });
		view = await render(
			<GoalSetupSheet isOpen onClose={() => {}} book={book} wpm={250} existing={null} />,
		);
		expect(document.querySelector('[data-testid="goal-rsvp"]')?.textContent).toContain(
			"RSVP at 333 wpm",
		);
	});
});
