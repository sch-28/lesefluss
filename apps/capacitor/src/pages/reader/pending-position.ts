/**
 * Synchronous, durable fallback for the reader's word position.
 *
 * `savePosition` writes the position to SQLite / IndexedDB asynchronously. On a
 * hard teardown (a web tab close / bfcache, or a mobile OS suspend-then-kill)
 * that async write can be abandoned before it commits, rewinding resume to the
 * last throttled / settled save. `localStorage` writes are synchronous and
 * survive teardown, so the reader mirrors each save here as a fallback and
 * reconciles on the next mount.
 *
 * Reconcile rule: a pending entry is preferred only when its timestamp is
 * STRICTLY newer than the book row's `lastRead`, so a committed save or a cloud
 * sync from another device always wins. The entry is consumed (cleared) once
 * read, and `savePosition` clears it as soon as the async DB write commits, so
 * an entry only lingers when the latest write did not land. Keyed per book, so
 * one book's fallback never bleeds into another.
 */

import { errorMessage, reportEvent } from "../../services/telemetry";

const PREFIX = "lesefluss:pending-pos:";

export type PendingPosition = { word: number; at: number };

/** Storage key for a book's pending position. Exposed for e2e assertions. */
export function pendingPositionKey(bookId: string): string {
	return `${PREFIX}${bookId}`;
}

export function writePendingPosition(bookId: string, word: number, at: number): void {
	try {
		localStorage.setItem(pendingPositionKey(bookId), JSON.stringify({ word, at }));
	} catch (err) {
		// Private mode / quota / disabled storage: durability is best-effort and
		// must never interfere with the real (async) save path. If localStorage is
		// unavailable the durable fallback is silently gone, which is one way
		// resume could break, so surface it as diagnostics.
		reportEvent("localstorage_unavailable", { message: errorMessage(err) });
	}
}

export function readPendingPosition(bookId: string): PendingPosition | null {
	try {
		const raw = localStorage.getItem(pendingPositionKey(bookId));
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Partial<PendingPosition>;
		if (typeof parsed?.word !== "number" || typeof parsed?.at !== "number") return null;
		if (!Number.isFinite(parsed.word) || parsed.word < 0) return null;
		if (!Number.isFinite(parsed.at)) return null;
		return { word: parsed.word, at: parsed.at };
	} catch {
		return null;
	}
}

export function clearPendingPosition(bookId: string): void {
	try {
		localStorage.removeItem(pendingPositionKey(bookId));
	} catch {
		// ignore
	}
}

/**
 * Decide whether a pending fallback should override the DB-seeded resume word.
 * Returns the recovered word, or null to keep the seeded value.
 *
 * Prefer the pending entry ONLY when it is strictly newer than the row's
 * `lastRead` AND points somewhere different, so a committed save or a cloud sync
 * from another device always wins, and writing the seed back to the fallback can
 * never clobber a real position on the next open.
 */
export function recoverPendingWord(
	seedWord: number,
	seedLastRead: number,
	pending: PendingPosition | null,
): number | null {
	if (pending && pending.at > seedLastRead && pending.word !== seedWord) {
		return pending.word;
	}
	return null;
}
