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

const PREFIX = "lesefluss:pending-pos:";

export type PendingPosition = { word: number; at: number };

/** Storage key for a book's pending position. Exposed for e2e assertions. */
export function pendingPositionKey(bookId: string): string {
	return `${PREFIX}${bookId}`;
}

export function writePendingPosition(bookId: string, word: number, at: number): void {
	try {
		localStorage.setItem(pendingPositionKey(bookId), JSON.stringify({ word, at }));
	} catch {
		// Private mode / quota / disabled storage: durability is best-effort and
		// must never interfere with the real (async) save path.
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
