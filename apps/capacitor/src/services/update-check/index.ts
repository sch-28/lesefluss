import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { SYNC_URL } from "../sync/auth-client";
import { shouldPromptUpdate } from "./compare-versions";
import { showUpdateToast } from "./update-toast";

/**
 * Nudges users on an outdated Android build to update, so fixes actually reach
 * the no-account cohort that never sees server-side changes. Best-effort: any
 * failure (offline, no SYNC_URL, parse error) silently no-ops.
 */

const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=app.lesefluss";

// Remembers the version the user chose to hide. They are nudged again only once
// an even newer version ships, not every launch.
const MUTE_KEY = "lesefluss:update-muted-version";

function readMutedVersion(): string | null {
	try {
		return localStorage.getItem(MUTE_KEY);
	} catch {
		return null;
	}
}

function muteVersion(version: string): void {
	try {
		localStorage.setItem(MUTE_KEY, version);
	} catch {
		// Best-effort: without storage the toast simply shows again next launch.
	}
}

// Survives a transient root re-mount so the nudge fires at most once per launch.
let didCheck = false;

export async function checkForUpdate(): Promise<void> {
	if (didCheck) return;
	didCheck = true;
	try {
		if (Capacitor.getPlatform() !== "android") return;
		if (!SYNC_URL) return;

		const res = await fetch(`${SYNC_URL}/api/latest-version`);
		if (!res.ok) return;
		const data = (await res.json()) as { android?: string | null };
		const latest = data?.android;

		const { version: current } = await App.getInfo();
		if (!shouldPromptUpdate(current, latest, readMutedVersion())) return;

		showUpdateToast({
			version: latest,
			onUpdate: () => void Browser.open({ url: PLAY_STORE_URL }),
			onHide: () => muteVersion(latest),
		});
	} catch {
		// Update check is best-effort and must never affect the app.
	}
}
