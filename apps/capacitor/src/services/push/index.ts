import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import {
	isPushPlatform,
	PUSH_API,
	PUSH_CHANNEL_ID,
	type PushPlatform,
	type PushRegisterBody,
} from "@lesefluss/core";
import { log } from "../../utils/log";
import { authedFetch } from "../authed-fetch";
import { getToken } from "../sync/session";

function pushPlatform(): PushPlatform | null {
	const platform = Capacitor.getPlatform();
	return isPushPlatform(platform) ? platform : null;
}

/** False in the web build, which stays inbox-only. */
export function isPushSupported(): boolean {
	return pushPlatform() !== null;
}

// Imported lazily so the web build never loads the plugin. The module, not the
// plugin, is what gets awaited: a Capacitor plugin proxy answers `.then` as a
// native call, so resolving a promise with it throws.
export const loadPluginModule = () => import("@capacitor/push-notifications");

/** `denied` means the OS will not show its prompt again; only system settings can turn it on. */
export type PushPermission = "granted" | "prompt" | "denied" | "unsupported";

const PERMISSION_ASKED_KEY = "push_permission_asked";

export async function getPushPermission(): Promise<PushPermission> {
	if (!pushPlatform()) return "unsupported";
	const { PushNotifications: push } = await loadPluginModule();
	const { receive } = await push.checkPermissions();
	if (receive === "granted") return "granted";
	return receive === "denied" ? "denied" : "prompt";
}

/** Shows the OS prompt; on a grant the device registers right away. */
export async function requestPushPermission(): Promise<PushPermission> {
	if (!pushPlatform()) return "unsupported";
	await markPushPermissionAsked();
	const { PushNotifications: push } = await loadPluginModule();
	const { receive } = await push.requestPermissions();
	if (receive !== "granted") return receive === "denied" ? "denied" : "prompt";
	await registerPushIfGranted();
	return "granted";
}

/** Once asked, whatever the answer, the app never offers again on its own. */
export async function wasPushPermissionAsked(): Promise<boolean> {
	return (await Preferences.get({ key: PERMISSION_ASKED_KEY })).value === "1";
}

export async function markPushPermissionAsked(): Promise<void> {
	await Preferences.set({ key: PERMISSION_ASKED_KEY, value: "1" });
}

const IMPORTANCE_DEFAULT = 3;
// The lock screen shows the content only if the user lets it show sensitive content.
const VISIBILITY_PRIVATE = 0;

const REGISTERED_KEY = "push_registered";

let tokenListeners: Promise<void> | null = null;
// The plugin reports the token on every register(), changed or not, and that runs on every
// resume; posting only a new token or account keeps app switching off the server's limit.
let lastPostedRegistration: string | null = null;

/** Once per process; a failed attempt is retried on the next registration. */
function listenForTokens(platform: PushPlatform): Promise<void> {
	tokenListeners ??= (async () => {
		const { PushNotifications: push } = await loadPluginModule();
		await push.addListener("registration", async ({ value }) => {
			const registration = `${await getToken()}:${value}`;
			if (registration === lastPostedRegistration) return;
			try {
				await authedFetch(PUSH_API.register, {
					method: "POST",
					body: JSON.stringify({ token: value, platform } satisfies PushRegisterBody),
				});
				lastPostedRegistration = registration;
			} catch (err) {
				log.warn("push", "token registration failed:", err);
			}
		});
		await push.addListener("registrationError", ({ error }) =>
			log.warn("push", "FCM registration failed:", error),
		);
	})().catch((err) => {
		tokenListeners = null;
		throw err;
	});
	return tokenListeners;
}

/**
 * Registers this device with FCM if permission was already granted; never
 * prompts. FCM rotates tokens, so this runs on every start and the
 * `registration` event reports each token to the server.
 */
export async function registerPushIfGranted(): Promise<void> {
	const platform = pushPlatform();
	if (!platform) return;
	const { PushNotifications: push } = await loadPluginModule();
	const { receive } = await push.checkPermissions();
	if (receive !== "granted") return;
	await listenForTokens(platform);
	if (platform === "android") {
		await push.createChannel({
			id: PUSH_CHANNEL_ID,
			name: "Friends and buddy reads",
			importance: IMPORTANCE_DEFAULT,
			visibility: VISIBILITY_PRIVATE,
		});
	}
	await push.register();
	await Preferences.set({ key: REGISTERED_KEY, value: "1" });
}

/**
 * Matches the registration to the permission, on start and on every resume:
 * registers once notifications are allowed (also from system settings), and
 * drops the token once they are turned off there, so the server stops sending.
 * Below Android 13 the permission always reads as granted, so turning
 * notifications off there is not seen.
 */
export async function syncPushRegistration(): Promise<void> {
	const permission = await getPushPermission();
	if (permission === "unsupported") return;
	if (permission === "granted") {
		await registerPushIfGranted();
		return;
	}
	if ((await Preferences.get({ key: REGISTERED_KEY })).value === "1") await unregisterPush();
}

/** Deletes the FCM token on the device, so pushes stop even when the server never hears of the sign-out. */
export async function unregisterPush(): Promise<void> {
	if (!pushPlatform()) return;
	const { PushNotifications: push } = await loadPluginModule();
	await push.unregister();
	lastPostedRegistration = null;
	await Preferences.remove({ key: REGISTERED_KEY });
}

/** What a signed-out account left in the tray is not for the next person holding the phone. */
export async function clearDeliveredPushes(): Promise<void> {
	if (!pushPlatform()) return;
	const { PushNotifications: push } = await loadPluginModule();
	await push.removeAllDeliveredNotifications();
}
