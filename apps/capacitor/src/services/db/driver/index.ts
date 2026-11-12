import { Capacitor } from "@capacitor/core";
import { log } from "../../../utils/log";
import { createCapacitorDriver } from "./native";
import type { DbDriver } from "./types";
import { hasOpfsApi } from "./web/opfs-layout";

export type { DbDriver, DbDriverKind, DbRow } from "./types";
export { STORAGE_BUSY_ERROR } from "./types";

/**
 * Picks the storage for this platform: the native plugin on Android, SQLite on
 * OPFS on the web, and the old jeep-sqlite store when OPFS is missing or the
 * move to it failed (the move retries on the next start). The OPFS driver
 * comes back open; `open()` on it is a no-op.
 */
export async function createDriver(): Promise<DbDriver> {
	if (Capacitor.isNativePlatform()) return createCapacitorDriver("native");

	if (hasOpfsApi()) {
		const { openOpfsDriver, OpfsUnavailableError } = await import("./web/client");
		try {
			return await openOpfsDriver();
		} catch (err) {
			if (!(err instanceof OpfsUnavailableError)) throw err;
			log.warn("db", "OPFS storage failed, using the legacy store:", err);
		}
	} else {
		log.warn("db", "No OPFS in this browser, using the legacy store");
	}
	const { createLegacyDriver } = await import("./web/legacy");
	return createLegacyDriver();
}

/** Deletes the database without an open driver, for a reset after a failed start. */
export async function deleteStoreWithoutDriver(): Promise<void> {
	if (Capacitor.isNativePlatform()) return createCapacitorDriver("native").deleteDatabase();
	const { wipeWebStores } = await import("./web/client");
	await wipeWebStores();
}
