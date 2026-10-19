import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	at,
	makeGoal,
	makePlan,
} from "../../../pages/library/reading-goal/__tests__/goal-fixtures";
import type { ReadingGoal } from "../../db/schema";
import type { ReadingGoalPlanResult } from "../../stats/reading-goal";

vi.mock("@capacitor/core", () => ({
	Capacitor: { isNativePlatform: () => true, getPlatform: () => "android" },
}));

const pending: { id: number; extra?: unknown }[] = [];
const plugin = {
	permission: "granted",
	checkPermissions: vi.fn(async () => ({ display: plugin.permission })),
	requestPermissions: vi.fn(async () => ({ display: plugin.permission })),
	createChannel: vi.fn(async () => {}),
	shown: [] as { id: number; title: string; body: string; extra?: unknown }[],
	getDeliveredNotifications: vi.fn(async () => ({ notifications: plugin.shown })),
	removeDeliveredNotifications: vi.fn(
		async ({ notifications }: { notifications: { id: number }[] }) => {
			plugin.shown = plugin.shown.filter((n) => !notifications.some((r) => r.id === n.id));
		},
	),
	getPending: vi.fn(async () => ({ notifications: [...pending] })),
	cancel: vi.fn(async ({ notifications }: { notifications: { id: number }[] }) => {
		for (const { id } of notifications)
			pending.splice(
				pending.findIndex((n) => n.id === id),
				1,
			);
	}),
	schedule: vi.fn(
		async ({ notifications }: { notifications: { id: number; extra: unknown }[] }) => {
			pending.push(...notifications.map(({ id, extra }) => ({ id, extra })));
			return {};
		},
	),
};
vi.mock("@capacitor/local-notifications", () => ({ LocalNotifications: plugin }));

const store: {
	goals: ReadingGoal[];
	plans: Map<string, { goal: ReadingGoal; plan: ReadingGoalPlanResult }>;
} = {
	goals: [],
	plans: new Map(),
};
vi.mock("../../db/queries", () => ({
	queries: {
		getGoalsWithReminders: async () => store.goals,
		getReadingGoalPlan: async (bookId: string) => store.plans.get(bookId) ?? null,
		getBook: async () => ({ title: "Dune" }),
	},
}));

const { syncGoalReminders } = await import("../index");
const { reminderId } = await import("../schedule");

function withGoal(goal: ReadingGoal, position = 0) {
	store.goals = [goal];
	store.plans.set(goal.bookId, { goal, plan: makePlan({ goal, position, now: at(1, 9) }) });
}

beforeEach(() => {
	pending.length = 0;
	store.goals = [];
	store.plans.clear();
	plugin.permission = "granted";
	plugin.shown = [];
	vi.clearAllMocks();
});

describe("syncGoalReminders", () => {
	it("schedules the goal's reminders on an Android channel", async () => {
		withGoal(makeGoal({ reminderTime: "20:00" }));
		await syncGoalReminders(at(1, 9));
		expect(plugin.createChannel).toHaveBeenCalledWith(
			expect.objectContaining({ id: "goal-reminders" }),
		);
		expect(pending).toHaveLength(4);
	});

	it("cancels them once the goal is removed, completed or loses its time", async () => {
		withGoal(makeGoal({ reminderTime: "20:00" }));
		await syncGoalReminders(at(1, 9));
		store.goals = [];
		await syncGoalReminders(at(1, 9));
		expect(pending).toEqual([]);
	});

	it("drops today after a sync pull brings today's target met from another device", async () => {
		const goal = makeGoal({ reminderTime: "20:00" });
		withGoal(goal);
		await syncGoalReminders(at(1, 9));
		expect(pending).toHaveLength(4);

		store.plans.set(goal.bookId, {
			goal,
			plan: makePlan({
				goal,
				position: 150,
				sessions: [
					{ startedAt: at(1, 10), endedAt: at(1, 11), startWord: 0, endWord: 150, wordsRead: 150 },
				],
				now: at(1, 12),
			}),
		});
		await syncGoalReminders(at(1, 12));
		expect(pending).toHaveLength(3);
	});

	it("takes today's reminder out of the shade when the day gets met after it fired", async () => {
		const goal = makeGoal({ reminderTime: "08:00" });
		plugin.shown = [
			{
				id: reminderId(goal.id, "2026-03-01"),
				title: "Dune",
				body: "",
				extra: { kind: "goal-reminder", bookId: "deadbeef" },
			},
		];
		store.goals = [goal];
		store.plans.set(goal.bookId, {
			goal,
			plan: makePlan({
				goal,
				position: 150,
				sessions: [
					{ startedAt: at(1, 10), endedAt: at(1, 11), startWord: 0, endWord: 150, wordsRead: 150 },
				],
				now: at(1, 12),
			}),
		});
		await syncGoalReminders(at(1, 12));
		expect(plugin.shown).toEqual([]);
	});

	it("schedules nothing without permission, and clears what was pending", async () => {
		pending.push({ id: 9, extra: { kind: "goal-reminder", bookId: "deadbeef" } });
		plugin.permission = "denied";
		withGoal(makeGoal({ reminderTime: "20:00" }));
		await syncGoalReminders(at(1, 9));
		expect(plugin.schedule).not.toHaveBeenCalled();
		expect(pending).toEqual([]);
	});

	it("ignores a goal whose book now has a different active goal", async () => {
		const goal = makeGoal({ reminderTime: "20:00" });
		store.goals = [goal];
		store.plans.set(goal.bookId, {
			goal: { ...goal, id: "other" },
			plan: makePlan({ goal, position: 0, now: at(1, 9) }),
		});
		await syncGoalReminders(at(1, 9));
		expect(pending).toEqual([]);
	});
});
