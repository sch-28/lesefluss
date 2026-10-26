import type { PositionRow } from "./db/queries/books";

const OWN_REVISIONS_KEPT = 32;
const ownRevisions = new Map<string, number[]>();

/**
 * Records a revision this device stamped on a book's position, so the open
 * reader (or the next one: the cache it seeds from can predate it) treats the
 * row as its own rather than as another device's.
 */
export function recordOwnRevision(bookId: string, rev: number): void {
	const revs = ownRevisions.get(bookId) ?? [];
	revs.push(rev);
	if (revs.length > OWN_REVISIONS_KEPT) revs.shift();
	ownRevisions.set(bookId, revs);
}

export function isOwnRevision(bookId: string, rev: number): boolean {
	return ownRevisions.get(bookId)?.includes(rev) ?? false;
}

type MissedPositionListener = (bookId: string, row: PositionRow) => void;
const missedPositionListeners = new Set<MissedPositionListener>();

/**
 * A pull brought a newer position than the reader had when the pull read the
 * row, but the reader wrote meanwhile, so the merge skipped it. The open reader
 * still has to decide whose position wins.
 */
export function reportMissedPosition(bookId: string, row: PositionRow): void {
	for (const listener of missedPositionListeners) listener(bookId, row);
}

export function onMissedPosition(listener: MissedPositionListener): () => void {
	missedPositionListeners.add(listener);
	return () => missedPositionListeners.delete(listener);
}
