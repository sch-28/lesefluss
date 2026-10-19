import type { PermissionState } from "@capacitor/core";

/**
 * Notification permission as the app's settings show it, for push and local
 * notifications alike. `denied` means only the system settings can turn it back
 * on; Android 13+ reports a first refusal as `prompt-with-rationale`, which
 * counts as `prompt`.
 */
export type NotificationPermission = "granted" | "prompt" | "denied" | "unsupported";

export function toNotificationPermission(state: PermissionState): NotificationPermission {
	if (state === "granted") return "granted";
	return state === "denied" ? "denied" : "prompt";
}

/** NotificationManager.IMPORTANCE_DEFAULT: sound, no heads-up. */
export const CHANNEL_IMPORTANCE_DEFAULT = 3;
