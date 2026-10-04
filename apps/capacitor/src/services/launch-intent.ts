import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { log } from "../utils/log";

let hasReceivedShare = false;
let hasReceivedPushTap = false;

/** Called by the share handler for every share / "Open with" intent it receives. */
export function markShareReceived(): void {
	hasReceivedShare = true;
}

export function markPushTapReceived(): void {
	hasReceivedPushTap = true;
}

let resolvePushListeners: () => void = () => {};
const pushListenersAttached = new Promise<void>((resolve) => {
	resolvePushListeners = resolve;
});
// The push listeners attach after a lazy import; should that never happen, launch goes on without them.
const PUSH_LISTENER_WAIT_MS = 3_000;

/** Called once the push tap listener is attached, or right away where push is unavailable. */
export function markPushListenersAttached(): void {
	resolvePushListeners();
}

/**
 * Whether this launch carried an intent that owns the first screen: an App
 * Link, the OAuth callback, an "Open with" file (all visible as a launch URL),
 * a share-sheet payload or a notification tap.
 *
 * The share and push checks rely on ordering: both handlers subscribe on root
 * mount, and Capacitor answers native calls in order, so a retained cold-start
 * share or notification tap is delivered before `getLaunchUrl` resolves. The
 * push listener attaches only after a lazy import, so that is awaited first.
 */
export async function launchHasIntent(): Promise<boolean> {
	if (!Capacitor.isNativePlatform()) return false;
	await Promise.race([
		pushListenersAttached,
		new Promise((resolve) => setTimeout(resolve, PUSH_LISTENER_WAIT_MS)),
	]);
	const launch = await CapacitorApp.getLaunchUrl().catch((err) => {
		log.warn("launch", "getLaunchUrl failed:", err);
		return undefined;
	});
	return Boolean(launch?.url) || hasReceivedShare || hasReceivedPushTap;
}
