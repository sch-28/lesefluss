/**
 * Dev-only window hooks the reader writes for Playwright e2e tests. Bodies are
 * unguarded; callsites wrap each call in `if (import.meta.env.DEV)` so esbuild
 * const-folds the call away in production. With no remaining references, this
 * whole module tree-shakes out of release bundles.
 *
 * Tests read these via `page.evaluate(() => window.__lesefluss_e2e_...)`.
 */

/** The code path a position save came from. */
export type SaveSource =
	| "kept-local"
	| "adopted"
	| "settle"
	| "jump"
	| "word-tap"
	| "scrub"
	| "browse"
	| "rsvp"
	| "rsvp-exit"
	| "read-aloud"
	| "recovered"
	| "unmount"
	| "pagehide";

export type E2ESaveEntry = {
	bookId: string;
	word: number;
	at: number;
	source: SaveSource;
};

export type E2ESaveHook = E2ESaveEntry & { count: number };

export type E2ESessionHook = {
	count: number;
	lastKind: "checkpoint" | "flush";
	bookId: string;
};

export type E2ELinkOpenHook = {
	href: string;
	at: number;
	count: number;
};

type E2EWindow = {
	__lesefluss_e2e_progress_word?: number;
	__lesefluss_e2e_save?: E2ESaveHook;
	__lesefluss_e2e_saveLog?: E2ESaveEntry[];
	__lesefluss_e2e_saveRequests?: number;
	__lesefluss_e2e_saveFinished?: number;
	__lesefluss_e2e_settles?: number;
	__lesefluss_e2e_settleLog?: { word: number; at: number }[];
	__lesefluss_e2e_lastJumpAt?: number;
	__lesefluss_e2e_syncPushRequests?: number;
	__lesefluss_e2e_hold?: E2EHoldPhase;
	__lesefluss_e2e_session?: E2ESessionHook;
	__lesefluss_e2e_session_ticks?: number;
	__lesefluss_e2e_link_open?: E2ELinkOpenHook;
};

function w(): E2EWindow {
	return window as unknown as E2EWindow;
}

export function publishProgressWord(word: number): void {
	w().__lesefluss_e2e_progress_word = word;
}

export function publishPositionSave(bookId: string, word: number, source: SaveSource): void {
	const e = w();
	const entry = { bookId, word, at: Date.now(), source };
	e.__lesefluss_e2e_save = { ...entry, count: (e.__lesefluss_e2e_save?.count ?? 0) + 1 };
	e.__lesefluss_e2e_saveLog ??= [];
	e.__lesefluss_e2e_saveLog.push(entry);
}

/**
 * A position write was decided, before its async DB write: a test asserting
 * "nothing is saved" counts these, so a slow commit can't land after its window.
 */
export function publishSaveRequest(): void {
	const e = w();
	e.__lesefluss_e2e_saveRequests = (e.__lesefluss_e2e_saveRequests ?? 0) + 1;
}

/** A requested write finished: landed, superseded by a newer one, or failed. */
export function publishSaveFinished(): void {
	const e = w();
	e.__lesefluss_e2e_saveFinished = (e.__lesefluss_e2e_saveFinished ?? 0) + 1;
}

/** A position save asked for a cloud push, whether or not it wrote the row. */
export function publishSyncPushRequest(): void {
	const e = w();
	e.__lesefluss_e2e_syncPushRequests = (e.__lesefluss_e2e_syncPushRequests ?? 0) + 1;
}

/** The view reported a settle (a scroll come to rest), whether or not it saves. */
export function publishSettle(word: number): void {
	const e = w();
	e.__lesefluss_e2e_settles = (e.__lesefluss_e2e_settles ?? 0) + 1;
	e.__lesefluss_e2e_settleLog ??= [];
	e.__lesefluss_e2e_settleLog.push({ word, at: Date.now() });
}

/** When the reader last jumped (what the scroll reader's jump guard counts from). */
export function publishJump(at: number): void {
	w().__lesefluss_e2e_lastJumpAt = at;
}

export type E2EHoldPhase = "idle" | "settling" | "holding";

/** The scroll reader's anchor hold: while not idle, scroll ends save nothing. */
export function publishHoldPhase(phase: E2EHoldPhase): void {
	w().__lesefluss_e2e_hold = phase;
}

export function publishSessionPersist(bookId: string, kind: "checkpoint" | "flush"): void {
	const e = w();
	e.__lesefluss_e2e_session = {
		bookId,
		lastKind: kind,
		count: (e.__lesefluss_e2e_session?.count ?? 0) + 1,
	};
}

/** Counts session tracker polls, so a test can wait for one to have seen a move. */
export function publishSessionTick(): void {
	const e = w();
	e.__lesefluss_e2e_session_ticks = (e.__lesefluss_e2e_session_ticks ?? 0) + 1;
}

export function publishLinkOpen(href: string): void {
	const e = w();
	e.__lesefluss_e2e_link_open = {
		href,
		at: Date.now(),
		count: (e.__lesefluss_e2e_link_open?.count ?? 0) + 1,
	};
}

export type E2EDevicePosition = (word: number) => Promise<void>;

/**
 * Lets a test deliver a BLE device's live position to the open reader. The
 * returned cleanup removes it only if no later mount has replaced it.
 */
export function exposeDevicePosition(apply: E2EDevicePosition): () => void {
	const e = window as unknown as { __lesefluss_e2e_devicePosition?: E2EDevicePosition };
	e.__lesefluss_e2e_devicePosition = apply;
	return () => {
		if (e.__lesefluss_e2e_devicePosition === apply) delete e.__lesefluss_e2e_devicePosition;
	};
}
