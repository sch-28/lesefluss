import { Capacitor } from "@capacitor/core";
import { log } from "../../../utils/log";
import { createCapacitorDriver } from "./native";
import { type DbDriver, STORAGE_UNAVAILABLE_ERROR } from "./types";
import { hasOpfsApi } from "./web/opfs-layout";

export type { DbDriver, DbDriverKind, DbRow } from "./types";
export { DB_IN_USE_ERROR, STORAGE_BUSY_ERROR, STORAGE_UNAVAILABLE_ERROR } from "./types";

/** Neither OPFS nor IndexedDB can be used in this window (blocked site data, a full disk). */
export class StorageUnavailableError extends Error {
	constructor(cause: unknown) {
		super(
			`This browser window doesn't allow Lesefluss to store data: ${cause instanceof Error ? cause.message : String(cause)}`,
		);
		this.name = STORAGE_UNAVAILABLE_ERROR;
	}
}

export interface CreateDriverOptions {
	/** The library's files are still held by a page that is letting go, and the open waits. */
	onWaiting?: () => void;
}

/**
 * Picks the storage for this platform: the native plugin on Android, SQLite on
 * OPFS on the web, and the old jeep-sqlite store when OPFS is missing or the
 * move to it failed (the move retries on the next start). The OPFS driver
 * comes back open; `open()` on it is a no-op.
 */
export async function createDriver(options: CreateDriverOptions = {}): Promise<DbDriver> {
	if (Capacitor.isNativePlatform()) return createCapacitorDriver("native");

	if (hasOpfsApi()) {
		const { openOpfsDriver, OpfsUnavailableError } = await import("./web/client");
		try {
			return await openOpfsDriver(undefined, options.onWaiting);
		} catch (err) {
			if (!(err instanceof OpfsUnavailableError)) throw err;
			log.warn("db", "OPFS storage failed, using the legacy store:", err);
		}
	} else {
		log.warn("db", "No OPFS in this browser, using the legacy store");
	}
	return openLegacyStore();
}

async function openLegacyStore(): Promise<DbDriver> {
	const { canOpenIndexedDb } = await import("./web/legacy-store");
	if (!(await canOpenIndexedDb())) {
		log.error("db", "No storage works in this window: IndexedDB refused too");
		throw new StorageUnavailableError(new Error("IndexedDB refused"));
	}
	try {
		const { createLegacyDriver } = await import("./web/legacy");
		return await createLegacyDriver();
	} catch (err) {
		log.error("db", "The legacy store failed to start:", err);
		throw new StorageUnavailableError(err);
	}
}

/** Deletes the database without an open driver, for a reset after a failed start. */
export async function deleteStoreWithoutDriver(): Promise<void> {
	if (Capacitor.isNativePlatform()) return createCapacitorDriver("native").deleteDatabase();
	const { wipeWebStores } = await import("./web/client");
	await wipeWebStores();
}
