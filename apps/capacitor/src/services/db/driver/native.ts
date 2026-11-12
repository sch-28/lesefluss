import {
	CapacitorSQLite,
	SQLiteConnection,
	type SQLiteDBConnection,
} from "@capacitor-community/sqlite";
import type { DbDriver, DbDriverKind, DbRow } from "./types";

const DB_NAME = "lesefluss.db";

const sqliteConnection = new SQLiteConnection(CapacitorSQLite);

/**
 * @capacitor-community/sqlite behind `DbDriver`: the native plugin on Android,
 * and on the web the plugin's jeep-sqlite store ("legacy"). The plugin wraps
 * every `run` in its own transaction unless told otherwise, which conflicts
 * with an outer `begin()`, so `run` opts out while one is open.
 */
export function createCapacitorDriver(kind: Extract<DbDriverKind, "native" | "legacy">): DbDriver {
	let conn: SQLiteDBConnection | null = null;
	let inTransaction = false;

	const connection = (): SQLiteDBConnection => {
		if (!conn) throw new Error("Database not open");
		return conn;
	};

	const close = async () => {
		if (!conn) return;
		conn = null;
		inTransaction = false;
		await sqliteConnection.closeConnection(DB_NAME, false);
	};

	return {
		kind,
		async open() {
			// A page reload keeps the native connection while this side starts empty;
			// createConnection would then fail with "already exists".
			await sqliteConnection.checkConnectionsConsistency().catch(() => {});
			const next = await sqliteConnection.createConnection(
				DB_NAME,
				false,
				"no-encryption",
				1,
				false,
			);
			try {
				await next.open();
			} catch (err) {
				await sqliteConnection.closeConnection(DB_NAME, false).catch(() => {});
				throw err;
			}
			conn = next;
		},
		close,
		async deleteDatabase() {
			await close();
			const exists = (await sqliteConnection.isDatabase(DB_NAME)).result;
			if (exists) await CapacitorSQLite.deleteDatabase({ database: DB_NAME });
		},
		async run(sql, params = []) {
			await connection().run(sql, params, !inTransaction);
		},
		async query(sql, params = []) {
			return ((await connection().query(sql, params)).values ?? []) as DbRow[];
		},
		async execute(sql) {
			await connection().execute(sql, false);
		},
		async begin() {
			await connection().beginTransaction();
			inTransaction = true;
		},
		async commit() {
			inTransaction = false;
			await connection().commitTransaction();
		},
		async rollback() {
			inTransaction = false;
			await connection().rollbackTransaction();
		},
	};
}
