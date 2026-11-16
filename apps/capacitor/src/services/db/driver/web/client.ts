import { log } from "../../../../utils/log";
import { type DbDriver, type DbRow, STORAGE_BUSY_ERROR } from "../types";
import type { StoreOutcome } from "./import-legacy";
import { deleteLegacyIdb } from "./legacy-store";
import { hasActiveMarker, hasOpfsApi, removeOpfsRoot } from "./opfs-layout";
import type { WorkerError, WorkerRequest, WorkerResponse, WorkerResult } from "./protocol";

export interface WorkerLike {
	postMessage(message: unknown): void;
	terminate(): void;
	onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null;
	onerror: ((event: ErrorEvent) => void) | null;
}

class WorkerRequestError extends Error {
	readonly opfsActive: boolean;
	constructor(error: WorkerError) {
		super(error.message);
		this.name = error.name;
		this.opfsActive = error.opfsActive === true;
	}
}

/** Promise-per-request over the worker's message channel. */
class WorkerChannel {
	private nextId = 1;
	private readonly pending = new Map<
		number,
		{ resolve: (r: WorkerResult) => void; reject: (e: Error) => void }
	>();

	constructor(private readonly worker: WorkerLike) {
		worker.onmessage = ({ data }) => {
			const entry = this.pending.get(data.id);
			if (!entry) return;
			this.pending.delete(data.id);
			if (data.ok) entry.resolve(data.result);
			else entry.reject(new WorkerRequestError(data.error));
		};
		worker.onerror = (event) => {
			event.preventDefault?.();
			this.failAll(new Error(`Database worker failed: ${event.message || "unknown error"}`));
		};
	}

	request(request: WorkerRequest): Promise<WorkerResult> {
		const id = this.nextId++;
		return new Promise((resolve, reject) => {
			this.pending.set(id, { resolve, reject });
			this.worker.postMessage({ id, ...request });
		});
	}

	terminate(): void {
		this.worker.terminate();
		this.failAll(new Error("Database worker closed"));
	}

	private failAll(err: Error) {
		for (const { reject } of this.pending.values()) reject(err);
		this.pending.clear();
	}
}

function spawnWorker(): WorkerLike {
	return new Worker(new URL("./worker.ts", import.meta.url), {
		type: "module",
		name: "lesefluss-db",
	}) as unknown as WorkerLike;
}

/** The open failed and the legacy store is the right one to use (OPFS never became the store). */
export class OpfsUnavailableError extends Error {
	constructor(cause: unknown) {
		super(`OPFS storage unavailable: ${cause instanceof Error ? cause.message : String(cause)}`);
		this.name = "OpfsUnavailableError";
	}
}

/**
 * The library lives on OPFS but its storage could not be opened, usually
 * because another tab holds it. Falling back to the legacy store here would show
 * an empty library, so the app stops instead.
 */
export class StorageBusyError extends Error {
	constructor() {
		super(
			"Lesefluss couldn't open its storage on this device. It may be open in another tab: close other Lesefluss tabs and reload.",
		);
		this.name = STORAGE_BUSY_ERROR;
	}
}

// A reload can start while the previous page's worker still holds the pool's handles.
const BUSY_RETRY_DELAYS_MS = [250, 500, 1000, 2000];

const MOVE_FAILURE_FLAG = "lesefluss:e2e-fail-move";

function simulateMoveFailure(): boolean {
	if (!import.meta.env.DEV) return false;
	try {
		return localStorage.getItem(MOVE_FAILURE_FLAG) === "1";
	} catch {
		return false;
	}
}

export async function wipeWebStores(): Promise<void> {
	if (hasOpfsApi()) await removeOpfsRootWithRetry();
	await deleteLegacyIdb();
}

async function removeOpfsRootWithRetry(): Promise<void> {
	const delays = [0, ...BUSY_RETRY_DELAYS_MS];
	for (const [i, delay] of delays.entries()) {
		if (delay) await new Promise((r) => setTimeout(r, delay));
		try {
			await removeOpfsRoot();
			break;
		} catch (err) {
			if (i === delays.length - 1) log.warn("db", "removing the OPFS storage failed:", err);
		}
	}
}

function createOpfsDriver(channel: WorkerChannel): DbDriver {
	let open = true;
	const close = async () => {
		if (!open) return;
		open = false;
		await channel.request({ op: "close" }).catch(() => {});
		channel.terminate();
	};
	return {
		kind: "opfs",
		async open() {},
		close,
		async deleteDatabase() {
			await close();
			await wipeWebStores();
		},
		async run(sql, params = []) {
			await channel.request({ op: "run", sql, params });
		},
		async query(sql, params = []) {
			return (await channel.request({ op: "query", sql, params })) as DbRow[];
		},
		async execute(sql) {
			await channel.request({ op: "execute", sql });
		},
		async begin() {
			await channel.request({ op: "execute", sql: "BEGIN" });
		},
		async commit() {
			await channel.request({ op: "execute", sql: "COMMIT" });
		},
		async rollback() {
			await channel.request({ op: "execute", sql: "ROLLBACK" });
		},
	};
}

/**
 * Opens the OPFS database in a worker, moving the legacy store over on the first
 * start. Throws `OpfsUnavailableError` when the legacy store should be used
 * instead, `StorageBusyError` when the library is on OPFS but can't be opened.
 * `onWaiting` fires before each retry, while a previous page may still hold the files.
 */
export async function openOpfsDriver(
	spawn: () => WorkerLike = spawnWorker,
	onWaiting?: () => void,
): Promise<DbDriver> {
	const delays = [0, ...BUSY_RETRY_DELAYS_MS];
	let lastError: unknown;
	for (const delay of delays) {
		if (delay) {
			onWaiting?.();
			await new Promise((r) => setTimeout(r, delay));
		}
		let channel: WorkerChannel | undefined;
		try {
			// Inside the try: a browser without module workers throws right here.
			channel = new WorkerChannel(spawn());
			const { outcome } = (await channel.request({
				op: "open",
				simulateMoveFailure: simulateMoveFailure(),
			})) as { outcome: StoreOutcome };
			log("db", `web storage: OPFS (${outcome})`);
			return createOpfsDriver(channel);
		} catch (err) {
			channel?.terminate();
			lastError = err;
			// A worker that died before answering can't say; ask OPFS directly.
			const opfsActive =
				err instanceof WorkerRequestError
					? err.opfsActive
					: await hasActiveMarker().catch(() => false);
			if (!opfsActive) throw new OpfsUnavailableError(err);
			log.warn("db", "OPFS storage busy, retrying:", err);
		}
	}
	log.error("db", "OPFS storage stayed busy:", lastError);
	throw new StorageBusyError();
}
