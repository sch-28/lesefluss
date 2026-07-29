/**
 * A real SQLite database for query tests.
 *
 * The team rule is not to mock what you own, and the query layer is exactly
 * that: a stubbed `db` would assert that drizzle was called a certain way, not
 * that the SQL answers the question. This runs the app's own migrations against
 * an in-memory database instead.
 *
 * The proxy deliberately mirrors the production Capacitor adapter, which maps
 * result rows *positionally* (`Object.values(row)`). A test that received named
 * columns would miss a whole class of column-order bug that only shows up on
 * device.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "../schema";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../drizzle");

interface Journal {
	entries: Array<{ tag: string }>;
}

/** Mirrors `sanitizeParams` in the production adapter: the bridge and
 *  `node:sqlite` both reject booleans, so drizzle's are mapped the same way. */
function toSqliteParams(params: unknown[]): SQLInputValue[] {
	return params.map((p) => (typeof p === "boolean" ? (p ? 1 : 0) : p)) as SQLInputValue[];
}

export function createTestDb() {
	const raw = new DatabaseSync(":memory:");

	const journal = JSON.parse(
		readFileSync(join(MIGRATIONS_DIR, "meta/_journal.json"), "utf8"),
	) as Journal;
	for (const entry of journal.entries) {
		const sql = readFileSync(join(MIGRATIONS_DIR, `${entry.tag}.sql`), "utf8");
		// drizzle separates statements within one migration by this marker.
		for (const statement of sql.split("--> statement-breakpoint")) {
			const trimmed = statement.trim();
			if (trimmed) raw.exec(trimmed);
		}
	}

	const db = drizzle<typeof schema>(
		async (sql, params, method) => {
			const statement = raw.prepare(sql);
			const values = toSqliteParams(params);
			if (method === "run") {
				statement.run(...values);
				return { rows: [] };
			}
			const rows = statement.all(...values) as Array<Record<string, unknown>>;
			if (method === "get") {
				const first = rows[0];
				return { rows: first ? Object.values(first) : [] };
			}
			return { rows: rows.map((row) => Object.values(row)) };
		},
		{ schema },
	);

	return { db, raw, close: () => raw.close() };
}
