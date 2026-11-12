import { drizzle } from "drizzle-orm/sqlite-proxy";
import { errorMessage, reportEvent } from "../telemetry";
import type { DbDriver } from "./driver";
import * as schema from "./schema";

/** First SQL keyword (UPDATE/INSERT/DELETE), for telemetry without leaking params. */
function sqlOp(sql: string): string {
	return sql.trim().split(/\s+/, 1)[0]?.toUpperCase() ?? "UNKNOWN";
}

/**
 * Sanitize query parameters before they reach a driver.
 *
 * The Android SQLite plugin, the strictest of them, passes params to SQLiteStatement.bindArgs() which only
 * accepts String, Long, Double, byte[], or null. JavaScript booleans and other types
 * must be converted first, otherwise the native layer throws "Failed query".
 *
 * - boolean  → 0 | 1  (SQLite has no boolean type; Drizzle stores them as integers)
 * - null/undefined → null  (kept as-is; the plugin handles null binding correctly)
 * - everything else passes through unchanged
 */
function sanitizeParams(params: unknown[]): unknown[] {
	return params.map((p) => (typeof p === "boolean" ? (p ? 1 : 0) : p));
}

/**
 * Create the Drizzle ORM instance over the active `DbDriver` via the
 * sqlite-proxy adapter.
 *
 * The `getDriver` callback defers access so the Drizzle instance can be
 * created at module load time while the driver is opened later in `initDb()`.
 */
export function createDrizzleAdapter(getDriver: () => DbDriver | null) {
	// Serialize writes only. The capacitor-community/sqlite plugin wraps each
	// `run` in an implicit transaction; overlapping awaits race and throw
	// "cannot start a transaction within a transaction". Reads (`query`) don't
	// open a tx and are safe in parallel — chaining them through `writeQueue`
	// would needlessly stall reads behind any in-flight write.
	//
	// Reads still chain off `writeQueue` so they observe pending writes.
	let writeQueue: Promise<unknown> = Promise.resolve();
	const enqueueWrite = <T>(fn: () => Promise<T>): Promise<T> => {
		const next = writeQueue.then(fn, fn);
		writeQueue = next.catch(() => {});
		return next;
	};

	return drizzle<typeof schema>(
		async (sql, params, method) => {
			const driver = getDriver();
			if (!driver) throw new Error("Database not initialised - call initDb() first");

			const safeParams = sanitizeParams(params as unknown[]);

			if (method === "run") {
				return enqueueWrite(async () => {
					try {
						await driver.run(sql, safeParams);
					} catch (err) {
						// Previously swallowed by the queue's `.catch`, leaving write
						// failures completely invisible. Surface them so a device that
						// silently can't persist (e.g. reading position never saving)
						// shows up in diagnostics. Params are never sent.
						reportEvent("db_write_error", {
							message: errorMessage(err),
							extra: { op: sqlOp(sql) },
						});
						throw err;
					}
					return { rows: [] };
				});
			}

			// Reads wait on pending writes so they see the latest committed state,
			// but don't block each other.
			await writeQueue.catch(() => {});
			const rows = await driver.query(sql, safeParams);

			if (method === "get") {
				return { rows: rows.length > 0 ? Object.values(rows[0]) : [] };
			}

			return { rows: rows.map((row) => Object.values(row)) };
		},
		{ schema },
	);
}
