import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { log } from "../utils/log";

let hasReceivedShare = false;

/** Called by the share handler for every share / "Open with" intent it receives. */
export function markShareReceived(): void {
	hasReceivedShare = true;
}

/**
 * Whether this launch carried an intent that owns the first screen: an App
 * Link, the OAuth callback, an "Open with" file (all visible as a launch URL)
 * or a share-sheet payload.
 *
 * The share check relies on ordering: the share handler subscribes on root
 * mount, before this runs, and Capacitor answers native calls in order, so a
 * retained cold-start share is delivered before `getLaunchUrl` resolves.
 */
export async function launchHasIntent(): Promise<boolean> {
	if (!Capacitor.isNativePlatform()) return false;
	const launch = await CapacitorApp.getLaunchUrl().catch((err) => {
		log.warn("launch", "getLaunchUrl failed:", err);
		return undefined;
	});
	return Boolean(launch?.url) || hasReceivedShare;
}
