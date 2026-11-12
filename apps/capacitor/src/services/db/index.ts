import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Preferences } from "@capacitor/preferences";
import { log } from "../../utils/log";
import { createDrizzleAdapter } from "./adapter";
import { createDriver, type DbDriver, deleteStoreWithoutDriver } from "./driver";
import { type TrackedDriver, trackCalls } from "./driver/track-calls";
import type { Ownership } from "./driver/web/ownership";
import { runMigrations } from "./migrations";
import { backfillAddedAt, backfillFinishedAt } from "./queries/books";

let _driver: DbDriver | null = null;
/** Set only after migrations ran; the Drizzle instance refuses queries until then. */
let _ready: DbDriver | null = null;
let _initPromise: Promise<void> | null = null;
let _ownership: Ownership | null = null;
let _tracked: TrackedDriver | null = null;

export interface InitDbOptions {
	/** "Use it here": take the library from the tab that holds it. */
	claim?: boolean;
	/** The start waits for the library to be let go of (a reload, another tab). */
	onWaiting?: () => void;
}

const movedListeners = new Set<() => void>();

/** Fires when another tab took the library and this one stopped using it. */
export function onDbMoved(listener: () => void): () => void {
	movedListeners.add(listener);
	return () => movedListeners.delete(listener);
}

const SETTLE_QUIET_MS = 150;
const SETTLE_MAX_MS = 3000;

/**
 * Another tab claimed the library. The reader's position flushes listen for
 * `pagehide`, so one is sent before the app unmounts (its unmount saves run
 * too); once the statements have settled the database closes and the lock goes.
 */
async function letGo(): Promise<void> {
	await _initPromise?.catch(() => {});
	window.dispatchEvent(new Event("pagehide"));
	for (const listener of movedListeners) listener();
	await _tracked?.settled(SETTLE_QUIET_MS, SETTLE_MAX_MS);
	const driver = _driver;
	_initPromise = null;
	_ready = null;
	_driver = null;
	_tracked = null;
	_ownership = null;
	await driver?.close().catch((err) => log.warn("db", "closing the database failed:", err));
}

/**
 * Open the database and run any pending migrations. Call once at app startup
 * (from DatabaseProvider). Concurrent calls (React Strict Mode double-effect)
 * share one init; a failed init is retried by the next call.
 */
export async function initDb(options: InitDbOptions = {}): Promise<void> {
	if (_initPromise) return _initPromise;

	_initPromise = (async () => {
		if (!Capacitor.isNativePlatform()) {
			const { acquireOwnership } = await import("./driver/web/ownership");
			_ownership = await acquireOwnership({
				claim: options.claim === true,
				onWaiting: options.onWaiting,
				onReleaseRequested: letGo,
			});
		}
		_tracked = trackCalls(await createDriver({ onWaiting: options.onWaiting }));
		const driver = _tracked.driver;
		_driver = driver;
		await driver.open();
		await runMigrations(driver);
		_ready = driver;
		// Idempotent, and only touches rows that are wrong, so both are cheap on
		// every start after the first. Books finished before `finished_at` existed
		// would otherwise never appear in a period's finished count.
		await backfillAddedAt();
		await backfillFinishedAt();
	})();

	try {
		return await _initPromise;
	} catch (err) {
		_initPromise = null;
		_ready = null;
		await _driver?.close().catch(() => {});
		_driver = null;
		_tracked = null;
		_ownership?.release();
		_ownership = null;
		throw err;
	}
}

/** Drizzle ORM over the active driver, via the sqlite-proxy adapter. */
export const db = createDrizzleAdapter(() => _ready);

// Recovery wipe — each step is independent so a partial failure still leaves the app launchable.
export async function resetAppData(): Promise<void> {
	// Drain any in-flight init so closeConnection doesn't race createConnection/open.
	if (_initPromise) {
		try {
			await _initPromise;
		} catch {
			// init failure is exactly why we're resetting; ignore.
		}
	}

	_initPromise = null;
	_ready = null;
	const driver = _driver;
	_driver = null;
	try {
		if (driver) await driver.deleteDatabase();
		else await deleteStoreWithoutDriver();
	} catch (err) {
		log.warn("db", "deleting the database failed:", err);
	}
	_tracked = null;
	_ownership?.release();
	_ownership = null;

	try {
		await Preferences.clear();
	} catch (err) {
		log.warn("db", "Preferences.clear failed:", err);
	}

	// Device-local flags and caches describe the install that is being wiped;
	// left behind, "already suggested e-ink mode" would outlive the reset.
	try {
		localStorage.clear();
	} catch (err) {
		log.warn("db", "localStorage.clear failed:", err);
	}

	if (Capacitor.isNativePlatform()) {
		try {
			await Filesystem.rmdir({
				path: "books",
				directory: Directory.Data,
				recursive: true,
			});
		} catch (err) {
			log.warn("db", "remove books dir failed:", err);
		}
	}
}
