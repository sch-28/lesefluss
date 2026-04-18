import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./index.js";

const MIGRATIONS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle");

export async function migrate() {
	const client = await pool.connect();
	try {
		await client.query(`
			CREATE TABLE IF NOT EXISTS catalog_schema_migrations (
				name text PRIMARY KEY,
				applied_at timestamptz NOT NULL DEFAULT now()
			)
		`);

		const { rows } = await client.query<{ name: string }>(
			"SELECT name FROM catalog_schema_migrations",
		);
		const applied = new Set(rows.map((r) => r.name));

		const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();

		for (const name of files) {
			if (applied.has(name)) continue;
			const sql = await readFile(join(MIGRATIONS_DIR, name), "utf8");
			console.log(`[migrate] applying ${name}`);
			await client.query("BEGIN");
			try {
				await client.query(sql);
				await client.query("INSERT INTO catalog_schema_migrations (name) VALUES ($1)", [name]);
				await client.query("COMMIT");
			} catch (err) {
				await client.query("ROLLBACK");
				throw err;
			}
		}
		console.log(`[migrate] up to date (${files.length} migration(s))`);
	} finally {
		client.release();
	}
}
