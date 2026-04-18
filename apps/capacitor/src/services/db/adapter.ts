import type { SQLiteDBConnection } from "@capacitor-community/sqlite";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "./schema";

/**
 * Sanitize query parameters before passing to the Capacitor SQLite native layer.
 *
 * The Android SQLite plugin passes params to SQLiteStatement.bindArgs() which only
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
 * Create the Drizzle ORM instance backed by @capacitor-community/sqlite
 * via the sqlite-proxy adapter.
 *
 * The `getConn` callback defers connection access so the Drizzle instance can be
 * created at module load time while the actual SQLite connection is established later
 * during `initDb()`.
 */
export function createDrizzleAdapter(getConn: () => SQLiteDBConnection | null) {
	return drizzle<typeof schema>(
		async (sql, params, method) => {
			const conn = getConn();
			if (!conn) throw new Error("Database not initialised - call initDb() first");

			const safeParams = sanitizeParams(params as unknown[]);

			if (method === "run") {
				await conn.run(sql, safeParams);
				return { rows: [] };
			}

			const result = await conn.query(sql, safeParams);
			const rows = result.values ?? [];

			if (method === "get") {
				return { rows: rows.length > 0 ? Object.values(rows[0]) : [] };
			}

			// "all" - return each row as a value array
			return { rows: rows.map((row) => Object.values(row)) };
		},
		{ schema },
	);
}
