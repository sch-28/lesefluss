import type { DbRow } from "../types";
import type { StoreOutcome } from "./import-legacy";

export type WorkerRequest =
	| { op: "open"; simulateMoveFailure?: boolean }
	| { op: "run"; sql: string; params: unknown[] }
	| { op: "query"; sql: string; params: unknown[] }
	| { op: "execute"; sql: string }
	| { op: "close" };

export type WorkerResult = { outcome: StoreOutcome } | DbRow[] | null;

export interface WorkerError {
	name: string;
	message: string;
	/** On a failed open: the OPFS database is already the library's store, so the old one must not be used. */
	opfsActive?: boolean;
}

export type WorkerResponse =
	| { id: number; ok: true; result: WorkerResult }
	| { id: number; ok: false; error: WorkerError };

/** Error names the worker sends for a failed open. */
export const OPEN_FAILED = "OpfsOpenFailed";
