import { Capacitor } from "@capacitor/core";
import { log } from "../../utils/log";
import { queries } from "../db/queries";
import {
	CHANNEL_IMPORTANCE_DEFAULT,
	type NotificationPermission,
	toNotificationPermission,
} from "../notification-permission";
import {
	applyReminders,
	GOAL_REMINDER_CHANNEL_ID,
	planReminders,
	type ReminderInput,
	type ReminderPlugin,
	shownRemindersToClear,
} from "./schedule";

/** Local notifications need the native shell; the web build hides the setting. */
export function areRemindersSupported(): boolean {
	return Capacitor.isNativePlatform();
}

// Lazy, so the web build never loads the plugin. The module is what gets awaited:
// a plugin proxy answers `.then` as a native call, so resolving a promise with it throws.
export const loadReminderPluginModule = () => import("@capacitor/local-notifications");

export async function getReminderPermission(): Promise<NotificationPermission> {
	if (!areRemindersSupported()) return "unsupported";
	const { LocalNotifications } = await loadReminderPluginModule();
	return toNotificationPermission((await LocalNotifications.checkPermissions()).display);
}

/** Shows the OS prompt; called only when the reader asks for reminders. */
export async function requestReminderPermission(): Promise<NotificationPermission> {
	if (!areRemindersSupported()) return "unsupported";
	const { LocalNotifications } = await loadReminderPluginModule();
	const permission = toNotificationPermission(
		(await LocalNotifications.requestPermissions()).display,
	);
	if (permission === "granted") requestReminderSync();
	return permission;
}

let channelReady: Promise<void> | null = null;

function ensureChannel(): Promise<void> {
	channelReady ??= (async () => {
		if (Capacitor.getPlatform() !== "android") return;
		const { LocalNotifications } = await loadReminderPluginModule();
		await LocalNotifications.createChannel({
			id: GOAL_REMINDER_CHANNEL_ID,
			name: "Reading goal reminders",
			importance: CHANNEL_IMPORTANCE_DEFAULT,
		});
	})().catch((err) => {
		channelReady = null;
		throw err;
	});
	return channelReady;
}

async function loadReminderInputs(now: number): Promise<ReminderInput[]> {
	const goals = await queries.getGoalsWithReminders();
	const inputs = await Promise.all(
		goals.map(async (goal): Promise<ReminderInput | null> => {
			const [result, book] = await Promise.all([
				queries.getReadingGoalPlan(goal.bookId, now),
				queries.getBook(goal.bookId),
			]);
			if (!result || !book || result.goal.id !== goal.id) return null;
			return { goal: result.goal, plan: result.plan, title: book.title };
		}),
	);
	return inputs.filter((input) => input !== null);
}

let running: Promise<void> = Promise.resolve();

/**
 * Rebuild the pending goal reminders from the current plans. Serialised, so two
 * overlapping triggers cannot interleave a cancel with the other's schedule.
 * Without permission nothing is scheduled, and anything left over is cancelled.
 * No-op where reminders are not supported.
 */
export function syncGoalReminders(now: number = Date.now()): Promise<void> {
	running = running.then(async () => {
		if (!areRemindersSupported()) return;
		const { LocalNotifications } = await loadReminderPluginModule();
		const plugin: ReminderPlugin = LocalNotifications;
		const permission = toNotificationPermission(
			(await LocalNotifications.checkPermissions()).display,
		);
		if (permission !== "granted") {
			await applyReminders(plugin, []);
			return;
		}
		await ensureChannel();
		const inputs = await loadReminderInputs(now);
		await applyReminders(plugin, planReminders(inputs, now), shownRemindersToClear(inputs));
	});
	running = running.catch((err) => log.warn("reminders", "rescheduling failed:", err));
	return running;
}

const SYNC_DEBOUNCE_MS = 1_000;
let pendingSync: ReturnType<typeof setTimeout> | null = null;

/** Coalesces bursts of triggers (a sync pull invalidates several queries at once). */
export function requestReminderSync(): void {
	if (!areRemindersSupported()) return;
	if (pendingSync) clearTimeout(pendingSync);
	pendingSync = setTimeout(() => {
		pendingSync = null;
		void syncGoalReminders();
	}, SYNC_DEBOUNCE_MS);
}
