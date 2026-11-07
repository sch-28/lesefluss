import { useRef } from "react";
import { queryHooks } from "../../services/db/hooks";
import type { Book } from "../../services/db/schema";
import { canHaveGoal } from "./reading-goal/goal-model";

/**
 * Whether the local data behind the book page's late content (speed chip, goal,
 * reading stats, journey, chapter count and list) has arrived. The page keeps
 * its loading state until then, so that content appears in its final layout
 * instead of pushing the rest of the page down one by one as each query lands.
 *
 * Waits on `isLoading`, not `isPending`: a query paused while the device is
 * offline stays pending without ever fetching, and must not hold the page.
 *
 * Latched per book: once a book's page is showing, a query going pending again
 * (the goal plan's key rolls over at midnight) must not blank it.
 */
export function useBookDetailReady(book: Book | null | undefined): boolean {
	const bookId = book?.id ?? "";
	const goalPlan = queryHooks.useReadingGoalPlan(book && canHaveGoal(book) ? book.id : null);
	const stats = queryHooks.useStatsBook(bookId);
	const content = queryHooks.useBookContent(bookId);
	const speedModel = queryHooks.useStatsSpeedModel();
	const settings = queryHooks.useSettings();
	const readyBookIdRef = useRef<string | null>(null);

	if (!book) return false;
	const isLoading =
		goalPlan.isLoading ||
		stats.isLoading ||
		content.isLoading ||
		speedModel.isLoading ||
		settings.isLoading;
	if (!isLoading) readyBookIdRef.current = book.id;
	return readyBookIdRef.current === book.id;
}
