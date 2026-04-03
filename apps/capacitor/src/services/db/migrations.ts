import type { SQLiteDBConnection } from "@capacitor-community/sqlite";
// Vite handles JSON imports natively
import journal from "../../../drizzle/meta/_journal.json";
import { log } from "../../utils/log";

// import.meta.glob with eager + raw gives us { "./0000_initial.sql": "CREATE TABLE..." }
// The path is relative to THIS file's location (src/services/db/) — 3 levels up to reach drizzle/
const migrationFiles = import.meta.glob<string>("../../../drizzle/*.sql", {
	eager: true,
	query: "?raw",
	import: "default",
});

/**
 * Walk the drizzle-kit _journal.json and apply any migrations not yet recorded.
 *
 * Each migration's SQL is loaded via Vite's import.meta.glob so you never need
 * to touch this file when adding new migrations — just run
 * `pnpm drizzle-kit generate` and the new entry + .sql file appear automatically.
 */
export async function runMigrations(conn: SQLiteDBConnection): Promise<void> {
	// transaction: false — avoid the auto-commit wrapper on this DDL statement
	await conn.execute(
		`CREATE TABLE IF NOT EXISTS __drizzle_migrations (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			tag TEXT NOT NULL UNIQUE,
			applied_at INTEGER NOT NULL
		)`,
		false,
	);

	for (const entry of journal.entries) {
		// Already applied?
		const result = await conn.query("SELECT id FROM __drizzle_migrations WHERE tag = ?", [
			entry.tag,
		]);
		if (result.values && result.values.length > 0) continue;

		// Resolve the SQL content from the glob map
		const key = `../../../drizzle/${entry.tag}.sql`;
		const sql = migrationFiles[key];
		if (!sql) throw new Error(`Migration file not found: ${entry.tag}.sql`);

		// Split on drizzle breakpoint marker and execute each statement
		const statements = sql
			.split("--> statement-breakpoint")
			.map((s) => s.trim())
			.filter(Boolean);

		// Wrap every migration in a transaction for atomicity.
		// IMPORTANT: pass transaction=false to every execute()/run() call inside —
		// those methods default to transaction=true and auto-commit their own transaction,
		// which conflicts with the outer beginTransaction().
		await conn.beginTransaction();
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

				await conn.execute(stmt, false);
			}

			await conn.run(
				"INSERT INTO __drizzle_migrations (tag, applied_at) VALUES (?, ?)",
				[entry.tag, Date.now()],
				false,
			);

			await conn.commitTransaction();
			log("db", `Applied migration: ${entry.tag}`);
		} catch (err) {
			try {
				await conn.rollbackTransaction();
			} catch {
				// Rollback may fail if the transaction was already closed — ignore
			}
			throw new Error(`Migration ${entry.tag} failed and was rolled back: ${err}`);
		}
	}
}
