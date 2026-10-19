import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { log } from "../utils/log";

let hasReceivedShare = false;
let hasReceivedNotificationTap = false;

/** Called by the share handler for every share / "Open with" intent it receives. */
export function markShareReceived(): void {
	hasReceivedShare = true;
}

/** A tapped push or goal reminder: either opens its own screen. */
export function markNotificationTapReceived(): void {
	hasReceivedNotificationTap = true;
}

function listenerGate() {
	let resolve: () => void = () => {};
	const attached = new Promise<void>((r) => {
		resolve = r;
	});
	return { attached, resolve };
}

const pushListeners = listenerGate();
const reminderListeners = listenerGate();
// Both tap listeners attach after a lazy import; should that never happen, launch goes on without them.
const TAP_LISTENER_WAIT_MS = 3_000;

/** Called once the push tap listener is attached, or right away where push is unavailable. */
export function markPushListenersAttached(): void {
	pushListeners.resolve();
}

/** Called once the goal reminder tap listener is attached, or right away where reminders are unavailable. */
export function markReminderListenersAttached(): void {
	reminderListeners.resolve();
}

/**
 * Whether this launch carried an intent that owns the first screen: an App
 * Link, the OAuth callback, an "Open with" file (all visible as a launch URL),
 * a share-sheet payload or a notification tap.
 *
 * The share and notification checks rely on ordering: the handlers subscribe on
 * root mount, and Capacitor answers native calls in order, so a retained
 * cold-start share or notification tap is delivered before `getLaunchUrl`
 * resolves. The push and reminder tap listeners attach only after a lazy
 * import, so both are awaited first.
 */
export async function launchHasIntent(): Promise<boolean> {
	if (!Capacitor.isNativePlatform()) return false;
	await Promise.race([
		Promise.all([pushListeners.attached, reminderListeners.attached]),
		new Promise((resolve) => setTimeout(resolve, TAP_LISTENER_WAIT_MS)),
	]);
	const launch = await CapacitorApp.getLaunchUrl().catch((err) => {
		log.warn("launch", "getLaunchUrl failed:", err);
		return undefined;
	});
	return Boolean(launch?.url) || hasReceivedShare || hasReceivedNotificationTap;
}
