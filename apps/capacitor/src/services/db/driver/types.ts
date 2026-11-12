export type DbDriverKind = "native" | "opfs" | "legacy";

export type DbRow = Record<string, unknown>;

/**
 * The SQLite connection the app runs on. `kind` says which storage is active:
 * native (Android), "opfs" (web, SQLite WASM on OPFS) or "legacy" (web, the
 * jeep-sqlite store in IndexedDB, kept as the fallback).
 */
export interface DbDriver {
	readonly kind: DbDriverKind;
	open(): Promise<void>;
	/** Safe to call when already closed. */
	close(): Promise<void>;
	/** Closes the connection if open, then deletes the stored database. */
	deleteDatabase(): Promise<void>;
	run(sql: string, params?: unknown[]): Promise<void>;
	query(sql: string, params?: unknown[]): Promise<DbRow[]>;
	/** One or more statements without parameters. */
	execute(sql: string): Promise<void>;
	begin(): Promise<void>;
	commit(): Promise<void>;
	rollback(): Promise<void>;
}

/** `Error.name` of the failure where the library is on OPFS but can't be opened right now. */
export const STORAGE_BUSY_ERROR = "StorageBusyError";
