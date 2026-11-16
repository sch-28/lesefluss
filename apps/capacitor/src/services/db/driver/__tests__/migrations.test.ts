// @vitest-environment node
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { runMigrations } from "../../migrations";
import type { DbDriver, DbRow } from "../types";

/** A DbDriver over node:sqlite, standing in for the OPFS worker's SQLite. */
function sqliteDriver(raw = new DatabaseSync(":memory:")): DbDriver & { raw: DatabaseSync } {
	return {
		raw,
		kind: "opfs",
		async open() {},
		async close() {},
		async deleteDatabase() {},
		async run(sql, params = []) {
			raw.prepare(sql).run(...(params as SQLInputValue[]));
		},
		async query(sql, params = []) {
			return raw.prepare(sql).all(...(params as SQLInputValue[])) as DbRow[];
		},
		async execute(sql) {
			raw.exec(sql);
		},
		async begin() {
			raw.exec("BEGIN");
		},
		async commit() {
			raw.exec("COMMIT");
		},
		async rollback() {
			raw.exec("ROLLBACK");
		},
	};
}

describe("runMigrations over a DbDriver", () => {
	it("builds the schema, and a second start applies nothing", async () => {
		const driver = sqliteDriver();
		await runMigrations(driver);
		const applied = driver.raw.prepare("SELECT count(*) AS n FROM __drizzle_migrations").get();
		expect(Number(applied?.n)).toBeGreaterThan(50);
		expect(driver.raw.prepare("SELECT count(*) AS n FROM books").get()?.n).toBe(0);

		await runMigrations(driver);
		expect(driver.raw.prepare("SELECT count(*) AS n FROM __drizzle_migrations").get()?.n).toBe(
			applied?.n,
		);
	});

	it("rolls a failed migration back and leaves no transaction open", async () => {
		const driver = sqliteDriver();
		await runMigrations(driver);
		const last = driver.raw
			.prepare("SELECT tag FROM __drizzle_migrations ORDER BY id DESC LIMIT 1")
			.get()?.tag;
		driver.raw.prepare("DELETE FROM __drizzle_migrations WHERE tag = ?").run(String(last));
		const failing: DbDriver = {
			...driver,
			async run() {
				throw new Error("disk full");
			},
		};

		await expect(runMigrations(failing)).rejects.toThrow(`Migration ${last} failed`);
		const recorded = driver.raw
			.prepare("SELECT count(*) AS n FROM __drizzle_migrations WHERE tag = ?")
			.get(String(last));
		expect(recorded?.n).toBe(0);
		// BEGIN fails inside an open transaction.
		expect(() => driver.raw.exec("BEGIN; COMMIT;")).not.toThrow();
	});
});
