import { beforeEach, describe, expect, it, vi } from "vitest";

const marker = vi.hoisted(() => ({ active: false }));
vi.mock("../web/opfs-layout", async (importActual) => ({
	...(await importActual<typeof import("../web/opfs-layout")>()),
	hasActiveMarker: async () => marker.active,
}));

import {
	OpfsUnavailableError,
	openOpfsDriver,
	StorageBusyError,
	type WorkerLike,
} from "../web/client";
import type { WorkerError, WorkerRequest, WorkerResponse, WorkerResult } from "../web/protocol";

type Reply = { ok: true; result: WorkerResult } | { ok: false; error: WorkerError };

/** A worker that answers each request from `answer`, asynchronously like a real one. */
function fakeWorker(answer: (request: WorkerRequest) => Reply) {
	const sent: WorkerRequest[] = [];
	const worker: WorkerLike & { terminated: boolean } = {
		onmessage: null,
		onerror: null,
		terminated: false,
		postMessage(message) {
			const { id, ...request } = message as { id: number } & WorkerRequest;
			sent.push(request as WorkerRequest);
			const reply = answer(request as WorkerRequest);
			queueMicrotask(() =>
				worker.onmessage?.({ data: { id, ...reply } as WorkerResponse } as MessageEvent),
			);
		},
		terminate() {
			worker.terminated = true;
		},
	};
	return { worker, sent };
}

/** A worker that dies before answering, like a crashed or unloadable worker script. */
function crashingWorker() {
	const worker: WorkerLike & { terminated: boolean } = {
		onmessage: null,
		onerror: null,
		terminated: false,
		postMessage() {
			queueMicrotask(() => worker.onerror?.({ message: "boom" } as ErrorEvent));
		},
		terminate() {
			worker.terminated = true;
		},
	};
	return worker;
}

const opened: Reply = { ok: true, result: { outcome: "existing" } };
const failedOpen = (opfsActive: boolean): Reply => ({
	ok: false,
	error: { name: "OpfsOpenFailed", message: "no handles", opfsActive },
});

describe("openOpfsDriver", () => {
	beforeEach(() => {
		marker.active = false;
	});

	it("returns a driver that forwards statements to the worker", async () => {
		const { worker, sent } = fakeWorker((request) => {
			if (request.op === "open") return opened;
			if (request.op === "query") return { ok: true, result: [{ id: "b1" }] };
			return { ok: true, result: null };
		});
		const driver = await openOpfsDriver(() => worker);

		expect(driver.kind).toBe("opfs");
		expect(await driver.query("SELECT id FROM books WHERE id = ?", ["b1"])).toEqual([{ id: "b1" }]);
		await driver.begin();
		await driver.run("UPDATE books SET title = ?", ["t"]);
		await driver.commit();
		await driver.close();

		expect(sent.slice(1)).toEqual([
			{ op: "query", sql: "SELECT id FROM books WHERE id = ?", params: ["b1"] },
			{ op: "execute", sql: "BEGIN" },
			{ op: "run", sql: "UPDATE books SET title = ?", params: ["t"] },
			{ op: "execute", sql: "COMMIT" },
			{ op: "close" },
		]);
		expect(worker.terminated).toBe(true);
	});

	it("passes a failed statement on as an error", async () => {
		const { worker } = fakeWorker((request) =>
			request.op === "open"
				? opened
				: { ok: false, error: { name: "SQLite3Error", message: "no such table: x" } },
		);
		const driver = await openOpfsDriver(() => worker);

		await expect(driver.run("DELETE FROM x")).rejects.toThrow("no such table: x");
	});

	it("hands over to the legacy store when OPFS never became the store", async () => {
		const { worker } = fakeWorker(() => failedOpen(false));

		await expect(openOpfsDriver(() => worker)).rejects.toBeInstanceOf(OpfsUnavailableError);
		expect(worker.terminated).toBe(true);
	});

	it("retries in a fresh worker while the OPFS store is busy", async () => {
		vi.useFakeTimers();
		const workers = [failedOpen(true), opened].map((reply) => fakeWorker(() => reply).worker);
		const spawn = vi.fn(() => workers[spawn.mock.calls.length - 1]);

		const pending = openOpfsDriver(spawn);
		await vi.runAllTimersAsync();
		const driver = await pending;

		expect(driver.kind).toBe("opfs");
		expect(spawn).toHaveBeenCalledTimes(2);
		expect(workers[0].terminated).toBe(true);
	});

	it("says it is waiting before each retry, and not when the store opens at once", async () => {
		vi.useFakeTimers();
		const onWaiting = vi.fn();
		await openOpfsDriver(() => fakeWorker(() => opened).worker, onWaiting);
		expect(onWaiting).not.toHaveBeenCalled();

		const workers = [failedOpen(true), opened].map((reply) => fakeWorker(() => reply).worker);
		const spawn = vi.fn(() => workers[spawn.mock.calls.length - 1]);
		const pending = openOpfsDriver(spawn, onWaiting);
		await vi.runAllTimersAsync();
		await pending;
		expect(onWaiting).toHaveBeenCalledTimes(1);
	});

	it("never falls back to the legacy store while the OPFS store stays busy", async () => {
		vi.useFakeTimers();
		const spawn = vi.fn(() => fakeWorker(() => failedOpen(true)).worker);

		const pending = openOpfsDriver(spawn);
		const assertion = expect(pending).rejects.toBeInstanceOf(StorageBusyError);
		await vi.runAllTimersAsync();
		await assertion;
		expect(spawn).toHaveBeenCalledTimes(5);
	});

	it("hands over to the legacy store when a crashed worker leaves no OPFS store behind", async () => {
		const worker = crashingWorker();

		await expect(openOpfsDriver(() => worker)).rejects.toBeInstanceOf(OpfsUnavailableError);
		expect(worker.terminated).toBe(true);
	});

	it("never falls back to the legacy store when a crashing worker sits on an OPFS store", async () => {
		vi.useFakeTimers();
		marker.active = true;
		const spawn = vi.fn(crashingWorker);

		const pending = openOpfsDriver(spawn);
		const assertion = expect(pending).rejects.toBeInstanceOf(StorageBusyError);
		await vi.runAllTimersAsync();
		await assertion;
		expect(spawn).toHaveBeenCalledTimes(5);
	});

	it("hands over to the legacy store when the browser can't start a module worker", async () => {
		const spawn = () => {
			throw new TypeError("Module scripts are not supported in workers");
		};

		await expect(openOpfsDriver(spawn)).rejects.toBeInstanceOf(OpfsUnavailableError);
	});
});
