/**
 * Session-scoped pin for the most recently read item. Library reads this on
 * mount and forces the matching card to the top of the "recent" sort so the
 * grid doesn't shift under the user's finger while React Query refetches.
 *
 * Cleared on first user interaction in the library (scroll / sort / filter)
 * and on a short TTL safety so a stale pin can't outlive its usefulness.
 */
export type JustReadKey = `book:${string}` | `series:${string}`;

let pinned: JustReadKey | null = null;
let pinnedAt = 0;
const TTL_MS = 60_000;

export function setJustRead(key: JustReadKey): void {
	pinned = key;
	pinnedAt = Date.now();
}

export function getJustRead(): JustReadKey | null {
	if (!pinned) return null;
	if (Date.now() - pinnedAt > TTL_MS) {
		pinned = null;
		return null;
	}
	return pinned;
}

export function clearJustRead(): void {
	pinned = null;
}
