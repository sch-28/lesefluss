import {
	CapacitorSQLite,
	SQLiteConnection,
	type SQLiteDBConnection,
} from "@capacitor-community/sqlite";
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
 * Safe to call multiple times (React strict mode, hot reload) — reuses existing connection.
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
