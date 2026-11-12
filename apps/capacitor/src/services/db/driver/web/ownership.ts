import { log } from "../../../../utils/log";
import { DB_IN_USE_ERROR } from "../types";

const LOCK_NAME = "lesefluss-db";
const CHANNEL_NAME = "lesefluss-db";

/** How long a start waits for a page that is still letting go (a reload, a return from sign-in). */
export const LET_GO_WAIT_MS = 5000;
/** How long "Use it here" waits for the other tab to save and let go. */
export const CLAIM_WAIT_MS = 8000;

type OwnershipMessage = { type: "ping" } | { type: "in-use" } | { type: "release" };

export class DbInUseError extends Error {
	constructor() {
		super("Lesefluss is open in another tab.");
		this.name = DB_IN_USE_ERROR;
	}
}

export interface OwnershipChannel {
	postMessage(message: OwnershipMessage): void;
	addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
	removeEventListener(type: "message", listener: (event: MessageEvent) => void): void;
	close(): void;
}

export interface OwnershipEnv {
	locks: LockManager | undefined;
	openChannel: () => OwnershipChannel;
	window?: Pick<Window, "addEventListener" | "removeEventListener">;
}

export interface Ownership {
	/** Drops the lock; safe to call more than once. */
	release(): void;
}

export interface OwnershipOptions {
	/** "Use it here": ask the holding tab to let go instead of waiting it out. */
	claim: boolean;
	/** The lock is held elsewhere and this start now waits for it. */
	onWaiting?: () => void;
	/** Another tab claimed the library; the lock drops once this settles. */
	onReleaseRequested: () => Promise<void>;
}

function defaultEnv(): OwnershipEnv {
	return {
		locks:
			typeof navigator !== "undefined" && typeof BroadcastChannel !== "undefined"
				? navigator.locks
				: undefined,
		openChannel: () => new BroadcastChannel(CHANNEL_NAME) as OwnershipChannel,
		window: typeof window !== "undefined" ? window : undefined,
	};
}

/**
 * One tab at a time owns the web library: it holds the Web Lock for as long as
 * it has the database open. Two tabs writing the same SQLite file through
 * separate workers would corrupt it, and OPFS access handles are exclusive anyway.
 *
 * Throws `DbInUseError` when another live tab holds it (it answers a ping), or
 * when the wait for it runs out.
 */
export async function acquireOwnership(
	options: OwnershipOptions,
	env: OwnershipEnv = defaultEnv(),
): Promise<Ownership> {
	const { locks } = env;
	if (!locks) {
		log.warn("db", "No Web Locks in this browser; tabs are not kept apart");
		return { release() {} };
	}

	let dropLock = () => {};
	const held = new Promise<void>((resolve) => {
		dropLock = resolve;
	});
	const requestLock = (lockOptions: LockOptions) =>
		new Promise<boolean>((resolve, reject) => {
			locks
				.request(LOCK_NAME, lockOptions, (lock) => {
					resolve(lock !== null);
					return lock ? held : undefined;
				})
				.catch(reject);
		});

	const channel = env.openChannel();
	let granted = await requestLock({ ifAvailable: true });
	if (!granted) {
		options.onWaiting?.();
		granted = await waitForLock(channel, requestLock, options.claim);
	}
	if (!granted) {
		channel.close();
		throw new DbInUseError();
	}

	let releasing = false;
	// A page on its way out still runs handlers for a moment; it must not tell
	// the page replacing it that the library is in use. Only a browser's own
	// pagehide counts: the app dispatches synthetic ones to flush saves.
	let leaving = false;
	const onPageHide = (event: Event) => {
		if (event.isTrusted) leaving = true;
	};
	const onPageShow = () => {
		leaving = false;
	};
	env.window?.addEventListener("pagehide", onPageHide);
	env.window?.addEventListener("pageshow", onPageShow);

	const release = () => {
		env.window?.removeEventListener("pagehide", onPageHide);
		env.window?.removeEventListener("pageshow", onPageShow);
		channel.removeEventListener("message", onMessage);
		channel.close();
		dropLock();
	};
	const onMessage = (event: MessageEvent) => {
		const message = event.data as OwnershipMessage | undefined;
		if (message?.type === "ping" && !releasing && !leaving) {
			channel.postMessage({ type: "in-use" });
		} else if (message?.type === "release" && !releasing) {
			releasing = true;
			log("db", "another tab claimed the library, letting go");
			options
				.onReleaseRequested()
				.catch((err) => log.error("db", "letting go of the library failed:", err))
				.finally(release);
		}
	};
	channel.addEventListener("message", onMessage);
	return { release };
}

async function waitForLock(
	channel: OwnershipChannel,
	requestLock: (options: LockOptions) => Promise<boolean>,
	claim: boolean,
): Promise<boolean> {
	const abort = new AbortController();
	const timer = setTimeout(() => abort.abort(), claim ? CLAIM_WAIT_MS : LET_GO_WAIT_MS);
	const onMessage = (event: MessageEvent) => {
		if (!claim && (event.data as OwnershipMessage | undefined)?.type === "in-use") abort.abort();
	};
	channel.addEventListener("message", onMessage);
	channel.postMessage({ type: claim ? "release" : "ping" });
	try {
		return await requestLock({ signal: abort.signal });
	} catch {
		return false;
	} finally {
		clearTimeout(timer);
		channel.removeEventListener("message", onMessage);
	}
}
