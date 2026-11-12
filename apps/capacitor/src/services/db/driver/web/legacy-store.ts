/**
 * Raw access to the old web store, without jeep-sqlite: jeep keeps the whole
 * SQLite file as one Uint8Array value in this IndexedDB object store.
 */
const LEGACY_IDB_NAME = "jeepSqliteStore";
const LEGACY_IDB_STORE = "databases";
const LEGACY_DB_KEY = "leseflussSQLite.db";
const LEGACY_BACKUP_KEY = "backup-leseflussSQLite.db";

function request<T>(req: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

/** Opens the store if it exists; never creates it (jeep would later find it without its object store). */
function openExisting(): Promise<IDBDatabase | null> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(LEGACY_IDB_NAME);
		let created = false;
		req.onupgradeneeded = () => {
			created = true;
			req.transaction?.abort();
		};
		req.onsuccess = () => {
			const db = req.result;
			if (db.objectStoreNames.contains(LEGACY_IDB_STORE)) resolve(db);
			else {
				db.close();
				resolve(null);
			}
		};
		req.onerror = () => (created ? resolve(null) : reject(req.error));
	});
}

async function withStore<T>(
	mode: IDBTransactionMode,
	fn: (store: IDBObjectStore, tx: IDBTransaction) => Promise<T>,
): Promise<T | undefined> {
	const db = await openExisting();
	if (!db) return undefined;
	try {
		const tx = db.transaction(LEGACY_IDB_STORE, mode);
		return await fn(tx.objectStore(LEGACY_IDB_STORE), tx);
	} finally {
		db.close();
	}
}

export async function hasLegacyDb(): Promise<boolean> {
	const count = await withStore("readonly", (store) => request(store.count(LEGACY_DB_KEY)));
	return (count ?? 0) > 0;
}

export async function readLegacyDb(): Promise<Uint8Array | undefined> {
	const value = await withStore("readonly", (store) => request(store.get(LEGACY_DB_KEY)));
	if (value instanceof Uint8Array) return value;
	if (value instanceof ArrayBuffer) return new Uint8Array(value);
	if (value === undefined) return undefined;
	throw new Error(
		`Legacy store holds an unexpected value (${Object.prototype.toString.call(value)})`,
	);
}

/** Deletes the database and its jeep backup in one transaction, resolved once committed. */
export async function deleteLegacyDb(): Promise<void> {
	await withStore(
		"readwrite",
		(store, tx) =>
			new Promise<void>((resolve, reject) => {
				store.delete(LEGACY_DB_KEY);
				store.delete(LEGACY_BACKUP_KEY);
				tx.oncomplete = () => resolve();
				tx.onerror = () => reject(tx.error);
				tx.onabort = () => reject(tx.error ?? new Error("Legacy store delete aborted"));
			}),
	);
}

/** Deletes the whole legacy IndexedDB database; for the app reset when jeep is not running. */
export function deleteLegacyIdb(): Promise<void> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.deleteDatabase(LEGACY_IDB_NAME);
		req.onsuccess = () => resolve();
		req.onerror = () => reject(req.error);
		// A connection still open elsewhere delays the delete until it closes; it still happens.
		req.onblocked = () => resolve();
	});
}

const PROBE_IDB_NAME = "lesefluss-storage-probe";

/** Whether this window lets the site keep IndexedDB data at all (blocked site data refuses it). */
export async function canOpenIndexedDb(): Promise<boolean> {
	try {
		const db = await request(indexedDB.open(PROBE_IDB_NAME));
		db.close();
		indexedDB.deleteDatabase(PROBE_IDB_NAME);
		return true;
	} catch {
		return false;
	}
}
