import sqlite3InitModule, { type Database, type SAHPoolUtil } from "@sqlite.org/sqlite-wasm";
import { log } from "../../../../utils/log";
import type { DbRow } from "../types";
import { prepareOpfsStore, type StoreOutcome } from "./import-legacy";
import { deleteLegacyDb, hasLegacyDb, readLegacyDb } from "./legacy-store";
import {
	hasActiveMarker,
	OPFS_DB_FILE,
	SAHPOOL_DIRECTORY,
	SAHPOOL_VFS_NAME,
	writeActiveMarker,
} from "./opfs-layout";
import { OPEN_FAILED, type WorkerError, type WorkerRequest, type WorkerResponse } from "./protocol";

type WorkerScope = {
	postMessage(message: WorkerResponse): void;
	onmessage: ((event: MessageEvent<{ id: number } & WorkerRequest>) => void) | null;
};
const scope = self as unknown as WorkerScope;

let db: Database | null = null;

async function verify(pool: SAHPoolUtil): Promise<void> {
	const check = new pool.OpfsSAHPoolDb(OPFS_DB_FILE);
	try {
		const result = check.selectValue("PRAGMA quick_check");
		if (result !== "ok") throw new Error(`Moved database failed its integrity check: ${result}`);
		check.selectValue("SELECT count(*) FROM sqlite_master");
	} finally {
		check.close();
	}
}

async function open(simulateMoveFailure: boolean): Promise<StoreOutcome> {
	const sqlite3 = await sqlite3InitModule();
	// preserveOnInitFailure: without it a failed install deletes the whole pool, i.e. the library.
	const pool = await sqlite3.installOpfsSAHPoolVfs({
		name: SAHPOOL_VFS_NAME,
		directory: SAHPOOL_DIRECTORY,
		preserveOnInitFailure: true,
	});
	const outcome = await prepareOpfsStore({
		hasMarker: hasActiveMarker,
		writeMarker: writeActiveMarker,
		hasLegacy: hasLegacyDb,
		readLegacy: readLegacyDb,
		deleteLegacy: deleteLegacyDb,
		hasDbFile: () => pool.getFileNames().includes(OPFS_DB_FILE),
		importDb: async (bytes) => pool.importDb(OPFS_DB_FILE, bytes),
		unlinkDb: () => {
			pool.unlink(OPFS_DB_FILE);
		},
		verify: async () => {
			if (simulateMoveFailure) throw new Error("Simulated move failure (dev only)");
			await verify(pool);
		},
		warn: (message: string, err?: unknown) => log.warn("db", message, err),
	});
	db = new pool.OpfsSAHPoolDb(OPFS_DB_FILE);
	return outcome;
}

function database(): Database {
	if (!db) throw new Error("Database not open");
	return db;
}

function bindable(params: unknown[]) {
	if (params.length === 0) return undefined as never;
	// The native bridge sends undefined as null; sqlite-wasm would refuse to bind it.
	return params.map((p) => (p === undefined ? null : p)) as never;
}

function toWorkerError(err: unknown): WorkerError {
	if (err instanceof Error) return { name: err.name, message: err.message };
	return { name: "Error", message: String(err) };
}

scope.onmessage = async ({ data }) => {
	const { id } = data;
	try {
		switch (data.op) {
			case "open": {
				let outcome: StoreOutcome;
				try {
					outcome = await open(data.simulateMoveFailure === true);
				} catch (err) {
					const opfsActive = await hasActiveMarker().catch(() => false);
					scope.postMessage({
						id,
						ok: false,
						error: { ...toWorkerError(err), name: OPEN_FAILED, opfsActive },
					});
					return;
				}
				scope.postMessage({ id, ok: true, result: { outcome } });
				return;
			}
			case "run":
				database().exec({ sql: data.sql, bind: bindable(data.params) });
				break;
			case "query": {
				const rows = database().exec({
					sql: data.sql,
					bind: bindable(data.params),
					rowMode: "object",
					returnValue: "resultRows",
				}) as DbRow[];
				scope.postMessage({ id, ok: true, result: rows });
				return;
			}
			case "execute":
				database().exec(data.sql);
				break;
			case "close":
				db?.close();
				db = null;
				break;
		}
		scope.postMessage({ id, ok: true, result: null });
	} catch (err) {
		scope.postMessage({ id, ok: false, error: toWorkerError(err) });
	}
};
