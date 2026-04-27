import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Preferences } from "@capacitor/preferences";
import {
	CapacitorSQLite,
	SQLiteConnection,
	type SQLiteDBConnection,
} from "@capacitor-community/sqlite";
import { log } from "../../utils/log";
import { createDrizzleAdapter } from "./adapter";
import { runMigrations } from "./migrations";

const DB_NAME = "lesefluss.db";

let _conn: SQLiteDBConnection | null = null;
let _initPromise: Promise<void> | null = null;

/**
 * Module-level SQLiteConnection singleton.
 * Exported so web-setup.ts can call initWebStore() during web bootstrap.
 */
export const sqliteConnection = new SQLiteConnection(CapacitorSQLite);

/**
 * Initialise the SQLite connection and run any pending migrations.
 * Call once at app startup (from DatabaseProvider).
 * Safe to call multiple times (React strict mode, hot reload) - reuses existing connection.
 * Uses a promise guard so concurrent calls (React Strict Mode double-effect) share one init.
 */
export async function initDb(): Promise<void> {
	if (_initPromise) return _initPromise;

	_initPromise = (async () => {
		_conn = await sqliteConnection.createConnection(DB_NAME, false, "no-encryption", 1, false);
		await _conn.open();
		await runMigrations(_conn);
	})();

	try {
		return await _initPromise;
	} catch (err) {
		// Reset so the next call retries instead of returning a cached rejection
		_initPromise = null;
		_conn = null;
		throw err;
	}
}

/**
 * Drizzle ORM instance backed by @capacitor-community/sqlite via the proxy adapter.
 *
 * The sqlite-proxy adapter wraps any async SQLite driver with typed glue:
 *   - Drizzle builds the SQL + params from typed queries (db.select().from(books)...)
 *   - The adapter callback forwards them to the Capacitor native plugin
 *   - Results come back as rows which Drizzle maps to typed objects
 */
export const db = createDrizzleAdapter(() => _conn);

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

	try {
		if (_conn) {
			await sqliteConnection.closeConnection(DB_NAME, false);
			_conn = null;
		}
	} catch (err) {
		log.warn("db", "closeConnection during reset failed:", err);
	}
	_initPromise = null;

	try {
		const dbExists = (await sqliteConnection.isDatabase(DB_NAME)).result;
		if (dbExists) await CapacitorSQLite.deleteDatabase({ database: DB_NAME });
	} catch (err) {
		log.warn("db", "deleteDatabase failed:", err);
	}

	try {
		await Preferences.clear();
	} catch (err) {
		log.warn("db", "Preferences.clear failed:", err);
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
