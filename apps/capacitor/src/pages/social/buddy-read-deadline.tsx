import { Button } from "@lesefluss/ui/button";
import { CalendarClock, Check, Target } from "lucide-react";
import { ListCard, SocialSection } from "@/components/social/social-ui";
import { useLocalDayNow } from "@/hooks/use-local-day";
import { queryHooks } from "@/services/db/hooks";
import type { Book, ReadingGoal } from "@/services/db/schema";
import { deadlineDayKey, formatDeadline, paceText } from "@/services/social/buddy-reads";
import { localDateKey, localDateOfKey } from "@/utils/date-utils";
import { canHaveGoal, canStartGoal } from "../library/reading-goal/goal-model";

export type AdoptState = "adopt" | "replace" | "adopted" | "unavailable";

/**
 * What adopting the buddy read's deadline would do for this member: nothing
 * left to do, replace their own goal on the book, or start one. Adopting is a
 * copy; a later change of the deadline leaves it as it was. Until the member's
 * goal has loaded nothing is offered, so a quick tap cannot skip the replace confirm.
 */
export function adoptState({
	book,
	goal,
	goalLoaded,
	deadline,
	today,
}: {
	book: Pick<Book, "seriesId" | "wordCount" | "wordPosition"> | null | undefined;
	goal: Pick<ReadingGoal, "status" | "mode" | "targetDate"> | null | undefined;
	goalLoaded: boolean;
	deadline: string;
	today: string;
}): AdoptState {
	if (!goalLoaded) return "unavailable";
	const active = goal?.status === "active" ? goal : null;
	if (active?.mode === "deadline" && active.targetDate === deadline) return "adopted";
	if (deadline < today || !book || !canStartGoal(book)) return "unavailable";
	return active ? "replace" : "adopt";
}

function toDateInput(ms: number | null): string {
	return ms === null ? "" : localDateKey(ms);
}

/** End of the picked local day, so "finish by Friday" includes Friday. */
function fromDateInput(value: string): number | null {
	return localDateOfKey(value, 23, 59, 59)?.getTime() ?? null;
}

type Props = {
	targetDate: number | null;
	/** The group's pace toward the deadline, from the member's progress; null when unknown. */
	onPace: boolean | null;
	isHost: boolean;
	isOffline: boolean;
	myBook: Book | null | undefined;
	onSetTarget: (targetDate: number | null) => void;
	isSettingTarget: boolean;
	/** Asks before an adopt replaces the member's own goal. */
	onConfirmReplace: (run: () => void) => void;
	onError: (err: unknown) => void;
};

/**
 * The buddy read's shared deadline. The host sets and clears it; every member,
 * host included, can adopt it as their own goal on their copy of the book.
 */
export function BuddyReadDeadline({
	targetDate,
	onPace,
	isHost,
	isOffline,
	myBook,
	onSetTarget,
	isSettingTarget,
	onConfirmReplace,
	onError,
}: Props) {
	const today = localDateKey(useLocalDayNow());
	const goalPlan = queryHooks.useReadingGoalPlan(
		targetDate !== null && myBook && canHaveGoal(myBook) ? myBook.id : null,
	);
	const create = queryHooks.useCreateReadingGoal();
	if (!isHost && targetDate === null) return null;

	const deadline = targetDate === null ? null : deadlineDayKey(targetDate);
	const passed = deadline !== null && deadline < today;
	const state = deadline
		? adoptState({
				book: myBook,
				goal: goalPlan.data?.goal,
				goalLoaded: !goalPlan.isPending,
				deadline,
				today,
			})
		: "unavailable";
	// Once adopted, the member's own goal says how they are doing; the group pace could contradict it.
	const status =
		state === "adopted" ? null : passed ? "passed" : onPace === null ? null : paceText(onPace);
	const adopt = () => {
		if (!myBook || !deadline) return;
		create.mutate(
			{ book: myBook, spec: { mode: "deadline", targetDate: deadline }, reminderTime: null },
			{ onError },
		);
	};

	return (
		<SocialSection title="Deadline">
			<ListCard>
				<div className="flex items-center gap-3 px-4 py-3">
					<CalendarClock className="size-5 shrink-0 text-muted-foreground" />
					<div className="flex min-w-0 flex-1 flex-col gap-0.5">
						{isHost ? (
							<input
								type="date"
								aria-label="Finish by"
								className="min-w-0 rounded-md border border-border bg-background px-2 py-1.5 text-foreground text-sm"
								value={toDateInput(targetDate)}
								min={toDateInput(Date.now())}
								disabled={isOffline || isSettingTarget}
								onChange={(e) => onSetTarget(fromDateInput(e.target.value))}
							/>
						) : (
							<span className="text-foreground text-sm tabular-nums">
								by {targetDate === null ? "" : formatDeadline(targetDate)}
							</span>
						)}
						{status && <span className="text-muted-foreground text-xs">{status}</span>}
					</div>
					{isHost && targetDate !== null && (
						<Button
							size="sm"
							variant="ghost"
							disabled={isOffline || isSettingTarget}
							onClick={() => onSetTarget(null)}
						>
							Clear
						</Button>
					)}
					{state === "adopted" && (
						<span className="flex items-center gap-1 text-muted-foreground text-xs">
							<Check className="size-3.5" aria-hidden />
							my goal
						</span>
					)}
					{(state === "adopt" || state === "replace") && (
						<Button
							size="sm"
							variant="outline"
							disabled={create.isPending}
							onClick={() => (state === "replace" ? onConfirmReplace(adopt) : adopt())}
						>
							<Target aria-hidden />
							Adopt
						</Button>
					)}
				</div>
			</ListCard>
		</SocialSection>
	);
}
