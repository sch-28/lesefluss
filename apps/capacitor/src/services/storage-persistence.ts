import { log } from "../utils/log";

const ASKED_KEY = "lesefluss:storage-persist-asked";

function alreadyAsked(): boolean {
	try {
		return localStorage.getItem(ASKED_KEY) === "1";
	} catch {
		return false;
	}
}

function markAsked() {
	try {
		localStorage.setItem(ASKED_KEY, "1");
	} catch {
		// Without storage the browser is asked again next start, which it answers silently.
	}
}

/**
 * Asks the browser once to keep the library through storage pressure (Safari
 * evicts a site's data otherwise, LESE-20.4). The answer goes to the console
 * only: the web build sends no telemetry.
 */
export async function requestPersistentStorage(
	storage: StorageManager | undefined = navigator.storage,
): Promise<void> {
	if (!storage?.persist || alreadyAsked()) return;
	try {
		const persisted = (await storage.persisted?.()) || (await storage.persist());
		markAsked();
		const estimate = await storage.estimate?.().catch(() => undefined);
		log("storage", persisted ? "persistent storage granted" : "persistent storage refused", {
			usage: estimate?.usage,
			quota: estimate?.quota,
		});
	} catch (err) {
		log.warn("storage", "persistent storage request failed:", err);
	}
}
