import {
	type ImageDimensions,
	type PreparedImage,
	type PrepareImage,
	prepareImage,
} from "@lesefluss/book-import";
import { log } from "../../utils/log";

export type PrepareRequest = { id: number; blob: Blob; size: ImageDimensions | null };
/** The worker answers every request, with the image or with why it failed. */
export type PrepareResponse =
	| { id: number; prepared: PreparedImage; error?: undefined }
	| { id: number; prepared?: undefined; error: string };

/** Idle time before the worker is released; an import sends its images back to back. */
const WORKER_IDLE_MS = 15_000;

type Pending = { resolve: (value: PreparedImage) => void; reject: (reason: unknown) => void };

let worker: Promise<Worker> | null = null;
let nextId = 0;
const pending = new Map<number, Pending>();
let idleTimer: ReturnType<typeof setTimeout> | null = null;

function releaseWorker(): void {
	void worker?.then((w) => w.terminate());
	worker = null;
}

function armIdleRelease(): void {
	if (idleTimer) clearTimeout(idleTimer);
	idleTimer = setTimeout(() => {
		if (pending.size === 0) releaseWorker();
	}, WORKER_IDLE_MS);
}

function failAll(reason: unknown): void {
	for (const entry of pending.values()) entry.reject(reason);
	pending.clear();
	releaseWorker();
}

async function createWorker(): Promise<Worker> {
	const { default: ImageWorker } = await import("./image-prepare.worker?worker");
	const created = new ImageWorker();
	created.onmessage = (event: MessageEvent<PrepareResponse>) => {
		const entry = pending.get(event.data.id);
		if (!entry) return;
		pending.delete(event.data.id);
		if (event.data.prepared) entry.resolve(event.data.prepared);
		else entry.reject(new Error(event.data.error));
		armIdleRelease();
	};
	created.onerror = (event) => failAll(event.error ?? new Error(event.message));
	return created;
}

/** One worker, created once even when two parses start it at the same time. */
function getWorker(): Promise<Worker> {
	worker ??= createWorker();
	return worker;
}

/**
 * `prepareImage` on a worker so decoding and re-encoding a book's illustrations
 * never stalls the UI during a parse. Falls back to the in-thread preparer
 * where workers are unavailable, or if the worker dies mid-import.
 */
export const prepareImageOffThread: PrepareImage = async (blob, size) => {
	if (typeof Worker !== "function") return prepareImage(blob, size);
	try {
		const target = await getWorker();
		const id = nextId++;
		return await new Promise<PreparedImage>((resolve, reject) => {
			pending.set(id, { resolve, reject });
			const request: PrepareRequest = { id, blob, size };
			target.postMessage(request);
		});
	} catch (err) {
		log.warn("book-import", "image worker failed; preparing on the main thread:", err);
		return prepareImage(blob, size);
	}
};
