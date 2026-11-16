import { afterEach, describe, expect, it, vi } from "vitest";
import {
	acquireOwnership,
	CLAIM_WAIT_MS,
	DbInUseError,
	LET_GO_WAIT_MS,
	type OwnershipChannel,
	type OwnershipEnv,
} from "../web/ownership";

/** One exclusive lock with the parts of the Web Locks API ownership uses. */
function fakeLocks() {
	let held = false;
	const waiters: Array<() => void> = [];
	const grant = async (callback: LockGrantedCallback<unknown>) => {
		held = true;
		try {
			return await callback({ name: "lesefluss-db", mode: "exclusive" } as Lock);
		} finally {
			held = false;
			waiters.shift()?.();
		}
	};
	const locks = {
		request(_name: string, options: LockOptions, callback: LockGrantedCallback<unknown>) {
			if (!held) return grant(callback);
			if (options.ifAvailable) return Promise.resolve(callback(null));
			return new Promise((resolve, reject) => {
				const go = () => resolve(grant(callback));
				waiters.push(go);
				options.signal?.addEventListener("abort", () => {
					const i = waiters.indexOf(go);
					if (i < 0) return;
					waiters.splice(i, 1);
					reject(new DOMException("aborted", "AbortError"));
				});
			});
		},
	} as unknown as LockManager;
	return { locks, isHeld: () => held };
}

/** BroadcastChannel semantics: a message reaches every other open member, asynchronously. */
function fakeBus() {
	const members = new Set<OwnershipChannel & { listeners: Set<(e: MessageEvent) => void> }>();
	const sent: unknown[] = [];
	const open = (): OwnershipChannel => {
		const channel = {
			listeners: new Set<(e: MessageEvent) => void>(),
			postMessage(message: unknown) {
				sent.push(message);
				for (const other of members) {
					if (other === channel) continue;
					queueMicrotask(() => {
						for (const l of other.listeners) l({ data: message } as MessageEvent);
					});
				}
			},
			addEventListener(_type: "message", listener: (e: MessageEvent) => void) {
				channel.listeners.add(listener);
			},
			removeEventListener(_type: "message", listener: (e: MessageEvent) => void) {
				channel.listeners.delete(listener);
			},
			close() {
				members.delete(channel);
			},
		};
		members.add(channel);
		return channel;
	};
	return { open, sent };
}

function tabs() {
	const { locks, isHeld } = fakeLocks();
	const bus = fakeBus();
	const env: OwnershipEnv = { locks, openChannel: bus.open };
	return { env, isHeld, sent: bus.sent };
}

const noRelease = async () => {};

/** A window whose events can be marked as the browser's own, which a real `Event` can't be. */
function fakeWindow() {
	const listeners = new Map<string, Set<(event: Event) => void>>();
	return {
		addEventListener(type: string, listener: (event: Event) => void) {
			if (!listeners.has(type)) listeners.set(type, new Set());
			listeners.get(type)?.add(listener);
		},
		removeEventListener(type: string, listener: (event: Event) => void) {
			listeners.get(type)?.delete(listener);
		},
		fire(type: string, isTrusted: boolean) {
			for (const listener of listeners.get(type) ?? []) listener({ type, isTrusted } as Event);
		},
	} as Pick<Window, "addEventListener" | "removeEventListener"> & {
		fire(type: string, isTrusted: boolean): void;
	};
}

describe("acquireOwnership", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("takes the free lock without waiting and drops it on release", async () => {
		const { env, isHeld } = tabs();
		const onWaiting = vi.fn();
		const ownership = await acquireOwnership(
			{ claim: false, onWaiting, onReleaseRequested: noRelease },
			env,
		);
		expect(isHeld()).toBe(true);
		expect(onWaiting).not.toHaveBeenCalled();

		ownership.release();
		await vi.waitFor(() => expect(isHeld()).toBe(false));
	});

	it("stops at once when a live tab answers that it holds the library", async () => {
		const { env } = tabs();
		await acquireOwnership({ claim: false, onReleaseRequested: noRelease }, env);

		const onWaiting = vi.fn();
		await expect(
			acquireOwnership({ claim: false, onWaiting, onReleaseRequested: noRelease }, env),
		).rejects.toBeInstanceOf(DbInUseError);
		expect(onWaiting).toHaveBeenCalledTimes(1);
	});

	it("waits for a page that is letting go and takes the lock once it is free", async () => {
		const { env, isHeld } = tabs();
		// A holder that no longer answers, like the page a reload replaces.
		const leaving = await acquireOwnership(
			{ claim: false, onReleaseRequested: noRelease },
			{ ...env, openChannel: () => fakeBus().open() },
		);

		const next = acquireOwnership({ claim: false, onReleaseRequested: noRelease }, env);
		leaving.release();
		await expect(next).resolves.toBeDefined();
		expect(isHeld()).toBe(true);
	});

	it("gives up with DbInUseError when the lock stays held past the wait", async () => {
		vi.useFakeTimers();
		const { env } = tabs();
		await acquireOwnership(
			{ claim: false, onReleaseRequested: noRelease },
			{ ...env, openChannel: () => fakeBus().open() },
		);

		const next = acquireOwnership({ claim: false, onReleaseRequested: noRelease }, env);
		const outcome = next.catch((err) => err);
		await vi.advanceTimersByTimeAsync(LET_GO_WAIT_MS);
		expect(await outcome).toBeInstanceOf(DbInUseError);
	});

	it("on a claim, the lock stays with the holder until its saves settled", async () => {
		const { env, isHeld } = tabs();
		let finishSaves = () => {};
		const holderSaves = new Promise<void>((resolve) => {
			finishSaves = resolve;
		});
		await acquireOwnership({ claim: false, onReleaseRequested: () => holderSaves }, env);

		let claimed = false;
		const claim = acquireOwnership({ claim: true, onReleaseRequested: noRelease }, env).then(
			(handle) => {
				claimed = true;
				return handle;
			},
		);
		for (let i = 0; i < 10; i++) await Promise.resolve();
		expect(claimed).toBe(false);
		expect(isHeld()).toBe(true);

		finishSaves();
		await claim;
		expect(claimed).toBe(true);
		expect(isHeld()).toBe(true);
	});

	it("a holder whose release fails still drops the lock", async () => {
		const { env } = tabs();
		await acquireOwnership(
			{
				claim: false,
				onReleaseRequested: async () => {
					throw new Error("close failed");
				},
			},
			env,
		);
		await expect(
			acquireOwnership({ claim: true, onReleaseRequested: noRelease }, env),
		).resolves.toBeDefined();
	});

	it("a claim the holder never answers ends with DbInUseError", async () => {
		vi.useFakeTimers();
		const { env } = tabs();
		await acquireOwnership(
			{ claim: false, onReleaseRequested: () => new Promise<void>(() => {}) },
			env,
		);

		const outcome = acquireOwnership({ claim: true, onReleaseRequested: noRelease }, env).catch(
			(err) => err,
		);
		await vi.advanceTimersByTimeAsync(CLAIM_WAIT_MS);
		expect(await outcome).toBeInstanceOf(DbInUseError);
	});

	it("a page on its way out stays quiet, so the page replacing it waits instead of giving up", async () => {
		const { env, isHeld, sent } = tabs();
		const page = fakeWindow();
		const leaving = await acquireOwnership(
			{ claim: false, onReleaseRequested: noRelease },
			{ ...env, window: page },
		);
		page.fire("pagehide", true);

		const next = acquireOwnership({ claim: false, onReleaseRequested: noRelease }, env);
		await vi.waitFor(() => expect(sent).toContainEqual({ type: "ping" }));
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(sent).not.toContainEqual({ type: "in-use" });
		leaving.release();
		await expect(next).resolves.toBeDefined();
		expect(isHeld()).toBe(true);
	});

	it("keeps answering after the app's own pagehide or a page restored from the cache", async () => {
		for (const events of [
			[["pagehide", false]],
			[
				["pagehide", true],
				["pageshow", true],
			],
		] as const) {
			const { env } = tabs();
			const page = fakeWindow();
			await acquireOwnership(
				{ claim: false, onReleaseRequested: noRelease },
				{ ...env, window: page },
			);
			for (const [type, trusted] of events) page.fire(type, trusted);

			await expect(
				acquireOwnership({ claim: false, onReleaseRequested: noRelease }, env),
			).rejects.toBeInstanceOf(DbInUseError);
		}
	});

	it("runs without a lock in a browser without Web Locks", async () => {
		const ownership = await acquireOwnership(
			{ claim: false, onReleaseRequested: noRelease },
			{ locks: undefined, openChannel: () => fakeBus().open() },
		);
		expect(() => ownership.release()).not.toThrow();
	});
});
