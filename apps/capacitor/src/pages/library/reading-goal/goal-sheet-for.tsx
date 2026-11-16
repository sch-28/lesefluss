import { bookPace } from "@lesefluss/core";
import { queryHooks } from "../../../services/db/hooks";
import type { Book, ReadingGoal } from "../../../services/db/schema";
import type { ReadingGoalPlan } from "../../../services/stats/reading-goal";
import { GoalSetupSheet } from "./goal-setup-sheet";

type Existing = { goal: ReadingGoal; plan: ReadingGoalPlan } | null;

/** The setup sheet at the book's own pace, or the edited goal's. */
export function GoalSheetFor({
	book,
	existing,
	isOpen,
	onClose,
}: {
	book: Book;
	existing: Existing;
	isOpen: boolean;
	onClose: () => void;
}) {
	const speedModel = queryHooks.useStatsSpeedModel();
	return (
		<GoalSetupSheet
			isOpen={isOpen}
			onClose={onClose}
			book={book}
			wpm={existing?.plan.pace.wpm ?? bookPace(speedModel.data, book.id).wpm}
			existing={existing}
		/>
	);
}

/** Edits a goal from outside its book page, where only the goal is at hand. */
export function GoalEditSheet({
	existing,
	isOpen,
	onClose,
}: {
	existing: NonNullable<Existing>;
	isOpen: boolean;
	onClose: () => void;
}) {
	const { data: book } = queryHooks.useBook(existing.goal.bookId);
	if (!book) return null;
	return <GoalSheetFor book={book} existing={existing} isOpen={isOpen} onClose={onClose} />;
}
