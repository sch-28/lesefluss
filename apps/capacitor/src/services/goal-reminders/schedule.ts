/**
 * Which goal reminders should be pending right now. Pure, so the rules (skip a
 * met day, stop at the finish, short horizon) are testable without the plugin.
 *
 * Only a few days are scheduled at a time, rather than a repeating alarm: each
 * day is a separate notification the app can drop once that day's target is
 * met, and the set is rebuilt whenever the plan or the day changes.
 */
import type { LocalNotificationsPlugin } from "@capacitor/local-notifications";
import { addDays } from "@lesefluss/core";
import { localDateOfKey } from "../../utils/date-utils";
import { minutesLabel, percentLabel } from "../../utils/reading-time";
import type { ReadingGoal } from "../db/schema";
import type { ReadingGoalPlanResult } from "../stats/reading-goal";

export const REMINDER_HORIZON_DAYS = 4;
export const GOAL_REMINDER_KIND = "goal-reminder";
export const GOAL_REMINDER_CHANNEL_ID = "goal-reminders";

const BOOK_ID = /^[0-9a-f]{8}$/;

export type ReminderInput = {
	goal: Pick<ReadingGoal, "id" | "bookId" | "reminderTime">;
	plan: ReadingGoalPlanResult;
	title: string;
};

export type PlannedReminder = {
	id: number;
	at: number;
	date: string;
	title: string;
	body: string;
	bookId: string;
};

/** Stable positive 31-bit id per goal and day, as both platforms require an int. */
export function reminderId(goalId: string, date: string): number {
	let hash = 0x811c9dc5;
	for (const char of `${goalId}:${date}`) {
		hash ^= char.charCodeAt(0);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash & 0x7fffffff || 1;
}

function reminderBody(plan: Extract<ReadingGoalPlanResult, { kind: "plan" }>): string {
	return `today ${percentLabel(plan.dailyTarget.percent)}% · ${minutesLabel(plan.dailyTarget.minutes)}`;
}

/**
 * Today (unless its target is met or the time has passed) and the following
 * days up to the projected finish, `horizonDays` in all. Later days repeat
 * today's target: it is what the plan asks for if today goes to plan, and the
 * set is rebuilt with the real figure as soon as the app runs that day.
 */
export function planReminders(
	inputs: ReminderInput[],
	now: number,
	horizonDays: number = REMINDER_HORIZON_DAYS,
): PlannedReminder[] {
	const planned: PlannedReminder[] = [];
	for (const { goal, plan, title } of inputs) {
		if (!goal.reminderTime || plan.kind !== "plan" || plan.isComplete) continue;
		const [hours, minutes] = goal.reminderTime.split(":").map(Number);
		const body = reminderBody(plan);
		for (let offset = 0; offset < horizonDays; offset++) {
			const date = addDays(plan.today, offset);
			if (date > plan.projectedFinishDate) break;
			if (offset === 0 && plan.isTodayMet) continue;
			const at = localDateOfKey(date, hours, minutes)?.getTime();
			if (at === undefined || at <= now) continue;
			planned.push({ id: reminderId(goal.id, date), at, date, title, body, bookId: goal.bookId });
		}
	}
	return planned;
}

/**
 * Ids of today's reminders that may already be in the notification shade but
 * no longer apply: today's target is met, or the goal is done. Cancelling only
 * stops a pending alarm; a shown notification has to be removed separately.
 */
export function shownRemindersToClear(inputs: ReminderInput[]): number[] {
	return inputs.flatMap(({ goal, plan }) =>
		plan.kind === "plan" && (plan.isTodayMet || plan.isComplete)
			? [reminderId(goal.id, plan.today)]
			: [],
	);
}

export type ReminderPlugin = Pick<
	LocalNotificationsPlugin,
	| "getPending"
	| "cancel"
	| "schedule"
	| "getDeliveredNotifications"
	| "removeDeliveredNotifications"
>;

function isGoalReminder(extra: unknown): extra is { kind: string } {
	return (
		typeof extra === "object" &&
		extra !== null &&
		"kind" in extra &&
		extra.kind === GOAL_REMINDER_KIND
	);
}

/**
 * Replace every pending goal reminder with `planned` and take `shownToClear`
 * out of the shade. Notifications the app did not schedule as goal reminders
 * are left alone.
 */
export async function applyReminders(
	plugin: ReminderPlugin,
	planned: PlannedReminder[],
	shownToClear: number[] = [],
): Promise<void> {
	const { notifications } = await plugin.getPending();
	const stale = notifications.filter((n) => isGoalReminder(n.extra)).map((n) => ({ id: n.id }));
	if (stale.length > 0) await plugin.cancel({ notifications: stale });

	if (shownToClear.length > 0) {
		const shown = (await plugin.getDeliveredNotifications()).notifications.filter(
			(n) => shownToClear.includes(n.id) && isGoalReminder(n.extra),
		);
		if (shown.length > 0) await plugin.removeDeliveredNotifications({ notifications: shown });
	}

	if (planned.length === 0) return;
	await plugin.schedule({
		notifications: planned.map((r) => ({
			id: r.id,
			title: r.title,
			body: r.body,
			schedule: { at: new Date(r.at), allowWhileIdle: true },
			// Inexact is fine for a daily nudge. Left at the plugin's default (exact),
			// Android 12+ would open the "Alarms & reminders" settings screen on schedule.
			isExactNotification: false,
			channelId: GOAL_REMINDER_CHANNEL_ID,
			extra: { kind: GOAL_REMINDER_KIND, bookId: r.bookId },
		})),
	});
}

/**
 * The book a tapped goal reminder belongs to, or null. The id is checked
 * against the book id format: the launcher activity is exported, so a crafted
 * intent can deliver any payload here.
 */
export function reminderBookId(extra: unknown): string | null {
	if (!isGoalReminder(extra) || !("bookId" in extra) || typeof extra.bookId !== "string") {
		return null;
	}
	return BOOK_ID.test(extra.bookId) ? extra.bookId : null;
}
