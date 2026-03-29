import {
	CapacitorSQLite,
	SQLiteConnection,
	type SQLiteDBConnection,
} from "@capacitor-community/sqlite";
import { drizzle } from "drizzle-orm/sqlite-proxy";
// Vite handles JSON imports natively
import journal from "../../../drizzle/meta/_journal.json";
import { log } from "../../utils/log";
import * as schema from "./schema";

// import.meta.glob with eager + raw gives us { "./0000_slippery_rhino.sql": "CREATE TABLE..." }
// The path is relative to THIS file's location (src/db/)
const migrationFiles = import.meta.glob<string>("../../drizzle/*.sql", {
	eager: true,
	query: "?raw",
	import: "default",
});

const DB_NAME = "rsvp.db";

let _conn: SQLiteDBConnection | null = null;

/**
 * Initialise the SQLite connection and run any pending migrations.
 * Call once at app startup (from DatabaseProvider).
 * Safe to call multiple times (React strict mode, hot reload) — reuses existing connection.
 */
export async function initDb(): Promise<void> {
	if (_conn) return; // already initialised

	const sqlite = new SQLiteConnection(CapacitorSQLite);

	_conn = await sqlite.createConnection(DB_NAME, false, "no-encryption", 1, false);
	await _conn.open();

	await runMigrations(_conn);
}

/**
 * Walk the drizzle-kit _journal.json and apply any migrations not yet recorded.
 *
 * Each migration's SQL is loaded dynamically via Vite's import.meta.glob so you
 * never need to touch this file when adding new migrations — just run
 * `pnpm drizzle-kit generate` and the new entry + .sql file appear automatically.
 */
async function runMigrations(conn: SQLiteDBConnection): Promise<void> {
	await conn.execute(`
		CREATE TABLE IF NOT EXISTS __drizzle_migrations (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			tag TEXT NOT NULL UNIQUE,
			applied_at INTEGER NOT NULL
		)
	`);

	// Baseline: if the tables from migration 0000 already exist (created by the old
	// database.ts before Drizzle was introduced), mark that migration as applied so
	// the runner doesn't try to CREATE TABLE again and fail.
	const firstTag = journal.entries[0]?.tag;
	if (firstTag) {
		const alreadyTracked = await conn.query("SELECT id FROM __drizzle_migrations WHERE tag = ?", [
			firstTag,
		]);
		const isTracked = (alreadyTracked.values?.length ?? 0) > 0;

		if (!isTracked) {
			// Check if the tables exist already (legacy DB)
			const tableCheck = await conn.query(
				"SELECT name FROM sqlite_master WHERE type='table' AND name='settings'",
			);
			const tablesExist = (tableCheck.values?.length ?? 0) > 0;

			if (tablesExist) {
				// Legacy DB: tables exist but migration isn't tracked — baseline it
				await conn.run("INSERT INTO __drizzle_migrations (tag, applied_at) VALUES (?, ?)", [
					firstTag,
					Date.now(),
				]);
				log("db", `Baselined existing DB at migration: ${firstTag}`);
			}
		}
	}

	for (const entry of journal.entries) {
		// Already applied?
		const result = await conn.query("SELECT id FROM __drizzle_migrations WHERE tag = ?", [
			entry.tag,
		]);
		if (result.values && result.values.length > 0) continue;

		// Resolve the SQL content from the glob map
		const key = `../../drizzle/${entry.tag}.sql`;
		const sql = migrationFiles[key];
		if (!sql) throw new Error(`Migration file not found: ${entry.tag}.sql`);

		// Split on drizzle breakpoint marker and execute each statement
		const statements = sql
			.split("--> statement-breakpoint")
			.map((s) => s.trim())
			.filter(Boolean);

		// Wrap every migration in a transaction so multi-statement recreations
		// (CREATE + INSERT + DROP + RENAME) are atomic. A partial failure won't
		// leave the DB in a torn state — it rolls back entirely and the migration
		// is not recorded, so the next launch will retry it cleanly.
		await conn.execute("BEGIN");
		try {
			for (const stmt of statements) {
				// SQLite doesn't support ALTER TABLE ADD COLUMN IF NOT EXISTS.
				// For ADD COLUMN statements, check if the column already exists first.
				const addColMatch = stmt.match(/ALTER TABLE [`"]?(\w+)[`"]? ADD COLUMN [`"]?(\w+)[`"]?/i);
				if (addColMatch) {
					const [, table, column] = addColMatch;
					const colCheck = await conn.query(`PRAGMA table_info(${table})`);
					const exists = colCheck.values?.some((r) => r.name === column);
					if (exists) continue;
				}

				// For RENAME TABLE statements, skip if the source table doesn't exist
				// (handles idempotent recovery migrations).
				const renameMatch = stmt.match(/ALTER TABLE [`"]?(\w+)[`"]? RENAME TO [`"]?(\w+)[`"]?/i);
				if (renameMatch) {
					const [, fromTable] = renameMatch;
					const tableCheck = await conn.query(
						"SELECT name FROM sqlite_master WHERE type='table' AND name=?",
						[fromTable],
					);
					if ((tableCheck.values?.length ?? 0) === 0) continue;
				}

				await conn.execute(stmt);
			}

			await conn.run("INSERT INTO __drizzle_migrations (tag, applied_at) VALUES (?, ?)", [
				entry.tag,
				Date.now(),
			]);

			await conn.execute("COMMIT");
			log("db", `Applied migration: ${entry.tag}`);
		} catch (err) {
			await conn.execute("ROLLBACK");
			throw new Error(`Migration ${entry.tag} failed and was rolled back: ${err}`);
		}
	}
}

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
	return params.map((p) => {
		if (typeof p === "boolean") return p ? 1 : 0;
		return p;
	});
}

/**
 * Drizzle ORM instance backed by @capacitor-community/sqlite via the proxy adapter.
 *
 * The sqlite-proxy adapter wraps any async SQLite driver with ~15 lines of glue:
 *   - Drizzle builds the SQL + params from typed queries (db.select().from(books)...)
 *   - This callback forwards them to the Capacitor native plugin
 *   - Results come back as rows which Drizzle maps to typed objects
 */
export const db = drizzle<typeof schema>(
	async (sql, params, method) => {
		if (!_conn) throw new Error("Database not initialised — call initDb() first");

		const safeParams = sanitizeParams(params as unknown[]);

		if (method === "run") {
			await _conn.run(sql, safeParams);
			return { rows: [] };
		}

		const result = await _conn.query(sql, safeParams);
		const rows = result.values ?? [];

		if (method === "get") {
			return { rows: rows.length > 0 ? Object.values(rows[0]) : [] };
		}

		// "all" — return each row as a value array
		return { rows: rows.map((row) => Object.values(row)) };
	},
	{ schema },
);
