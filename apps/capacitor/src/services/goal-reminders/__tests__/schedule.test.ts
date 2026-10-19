import { describe, expect, it, vi } from "vitest";
import {
	at,
	makeGoal,
	makePlan,
	session,
} from "../../../pages/library/reading-goal/__tests__/goal-fixtures";
import {
	applyReminders,
	GOAL_REMINDER_KIND,
	planReminders,
	type ReminderInput,
	type ReminderPlugin,
	reminderBookId,
	reminderId,
	shownRemindersToClear,
} from "../schedule";

function input(overrides: Partial<ReminderInput> & { now?: number; position?: number } = {}) {
	const goal = makeGoal({ reminderTime: "20:00" });
	return {
		goal,
		plan: makePlan({ goal, position: overrides.position ?? 0, now: overrides.now ?? at(1, 9) }),
		title: "Dune",
		...overrides,
	} satisfies ReminderInput & { now?: number; position?: number };
}

const dates = (planned: { date: string }[]) => planned.map((r) => r.date);

describe("planReminders", () => {
	it("schedules today and the next days at the chosen time, with today's target", () => {
		const planned = planReminders([input()], at(1, 9));
		expect(dates(planned)).toEqual(["2026-03-01", "2026-03-02", "2026-03-03", "2026-03-04"]);
		expect(planned[0]).toMatchObject({
			at: new Date(2026, 2, 1, 20, 0).getTime(),
			title: "Dune",
			body: "today 10.0% · < 1 min",
			bookId: "deadbeef",
		});
	});

	it("skips today once its target is met, but keeps the next days", () => {
		const goal = makeGoal({ reminderTime: "20:00" });
		const plan = makePlan({ goal, position: 120, sessions: [session(1, 0, 120)], now: at(1, 21) });
		expect(plan.isTodayMet).toBe(true);
		const planned = planReminders([{ goal, plan, title: "Dune" }], at(1, 9));
		expect(dates(planned)[0]).toBe("2026-03-02");
	});

	it("skips today once the time has passed", () => {
		expect(dates(planReminders([input()], at(1, 21)))[0]).toBe("2026-03-02");
	});

	it("rolls over to the new day", () => {
		const planned = planReminders([input({ now: at(2, 8) })], at(2, 8));
		expect(dates(planned)).toEqual(["2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05"]);
	});

	it("stops at the projected finish", () => {
		const planned = planReminders([input({ now: at(9, 8) })], at(9, 8));
		expect(dates(planned)).toEqual(["2026-03-09", "2026-03-10"]);
	});

	it("schedules nothing without a time, for a completed goal or for an unknown length", () => {
		const off = input();
		expect(
			planReminders([{ ...off, goal: { ...off.goal, reminderTime: null } }], at(1, 9)),
		).toEqual([]);

		const done = makeGoal({ reminderTime: "20:00", status: "completed", completedAt: at(1, 8) });
		const completed = { goal: done, plan: makePlan({ goal: done, position: 960 }), title: "Dune" };
		expect(planReminders([completed], at(1, 9))).toEqual([]);

		const unknown = {
			...off,
			plan: { kind: "unknown-length" as const, daysRead: 0, isComplete: false },
		};
		expect(planReminders([unknown], at(1, 9))).toEqual([]);
	});

	it("gives every goal and day its own stable id", () => {
		expect(reminderId("g1", "2026-03-01")).toBe(reminderId("g1", "2026-03-01"));
		expect(reminderId("g1", "2026-03-01")).not.toBe(reminderId("g1", "2026-03-02"));
		expect(reminderId("g1", "2026-03-01")).toBeGreaterThan(0);
		expect(reminderId("g1", "2026-03-01")).toBeLessThanOrEqual(0x7fffffff);
	});
});

type Shown = { id: number; title: string; body: string; extra?: unknown };

function fakePlugin(pending: { id: number; extra?: unknown }[], shown: Shown[] = []) {
	const plugin = {
		getPending: vi.fn(async () => ({
			notifications: pending.map((n) => ({ title: "", body: "", ...n })),
		})),
		cancel: vi.fn(async () => {}),
		schedule: vi.fn(async () => ({ notifications: [] })),
		getDeliveredNotifications: vi.fn(async () => ({ notifications: shown })),
		removeDeliveredNotifications: vi.fn(async () => {}),
	};
	// The mock covers only the calls the scheduler makes.
	return plugin as typeof plugin & ReminderPlugin;
}

describe("applyReminders", () => {
	it("replaces the pending goal reminders and leaves other notifications alone", async () => {
		const plugin = fakePlugin([
			{ id: 1, extra: { kind: GOAL_REMINDER_KIND, bookId: "old" } },
			{ id: 2, extra: { kind: "something-else" } },
			{ id: 3 },
		]);
		const planned = planReminders([input()], at(1, 9)).slice(0, 1);
		await applyReminders(plugin, planned);
		expect(plugin.cancel).toHaveBeenCalledWith({ notifications: [{ id: 1 }] });
		expect(plugin.schedule).toHaveBeenCalledWith({
			notifications: [
				{
					id: planned[0]?.id,
					title: "Dune",
					body: "today 10.0% · < 1 min",
					schedule: { at: new Date(2026, 2, 1, 20, 0), allowWhileIdle: true },
					isExactNotification: false,
					channelId: "goal-reminders",
					extra: { kind: GOAL_REMINDER_KIND, bookId: "deadbeef" },
				},
			],
		});
	});

	it("only cancels once a goal is removed or completed", async () => {
		const plugin = fakePlugin([{ id: 7, extra: { kind: GOAL_REMINDER_KIND, bookId: "deadbeef" } }]);
		await applyReminders(plugin, []);
		expect(plugin.cancel).toHaveBeenCalledWith({ notifications: [{ id: 7 }] });
		expect(plugin.schedule).not.toHaveBeenCalled();
	});

	it("takes today's shown reminder out of the shade once the day is met", async () => {
		const today = reminderId("g1", "2026-03-01");
		const plugin = fakePlugin(
			[],
			[
				{
					id: today,
					title: "Dune",
					body: "",
					extra: { kind: GOAL_REMINDER_KIND, bookId: "deadbeef" },
				},
				{ id: 99, title: "Friend", body: "", extra: { kind: "push" } },
			],
		);
		await applyReminders(plugin, [], [today, 99]);
		expect(plugin.removeDeliveredNotifications).toHaveBeenCalledWith({
			notifications: [expect.objectContaining({ id: today })],
		});
	});

	it("does nothing when there is nothing pending or planned", async () => {
		const plugin = fakePlugin([]);
		await applyReminders(plugin, []);
		expect(plugin.cancel).not.toHaveBeenCalled();
		expect(plugin.schedule).not.toHaveBeenCalled();
	});
});

describe("shownRemindersToClear", () => {
	it("names today's reminder for goals whose day is met or that are done", () => {
		const goal = makeGoal({ reminderTime: "20:00" });
		const met = makePlan({ goal, position: 120, sessions: [session(1, 0, 120)], now: at(1, 21) });
		const open = makePlan({ goal, position: 0, now: at(1, 9) });
		expect(shownRemindersToClear([{ goal, plan: met, title: "Dune" }])).toEqual([
			reminderId(goal.id, "2026-03-01"),
		]);
		expect(shownRemindersToClear([{ goal, plan: open, title: "Dune" }])).toEqual([]);
	});
});

describe("reminderBookId", () => {
	it("accepts only a well-formed book id, as any app can send the launcher an intent", () => {
		expect(reminderBookId({ kind: GOAL_REMINDER_KIND, bookId: "../../x" })).toBeNull();
		expect(reminderBookId({ kind: GOAL_REMINDER_KIND, bookId: "DEADBEEF" })).toBeNull();
		expect(reminderBookId({ kind: GOAL_REMINDER_KIND, bookId: 12345678 })).toBeNull();
		expect(reminderBookId({ kind: GOAL_REMINDER_KIND })).toBeNull();
	});

	it("reads the book only from a goal reminder's payload", () => {
		expect(reminderBookId({ kind: GOAL_REMINDER_KIND, bookId: "deadbeef" })).toBe("deadbeef");
		expect(reminderBookId({ kind: "other", bookId: "deadbeef" })).toBeNull();
		expect(reminderBookId(undefined)).toBeNull();
	});
});
