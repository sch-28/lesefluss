/** How long listing counts (tags, genres, languages) are served from memory. */
export const COUNTS_CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * Per-key memo with expiry, for listing endpoints whose GROUP BY scans the
 * whole table. Bounded: keys come from request params, so an unbounded map
 * would grow with every distinct value a client sends.
 */
export function ttlCache<T>(ttlMs: number, maxEntries = 64) {
	const entries = new Map<string, { at: number; value: Promise<T> }>();

	function evict(now: number) {
		for (const [key, entry] of entries) {
			if (now - entry.at >= ttlMs) entries.delete(key);
		}
		// Map iterates in insertion order, so the first key is the oldest.
		while (entries.size >= maxEntries) {
			const oldest = entries.keys().next().value;
			if (oldest === undefined) break;
			entries.delete(oldest);
		}
	}

	return {
		get(key: string, load: () => Promise<T>): Promise<T> {
			const now = Date.now();
			const hit = entries.get(key);
			if (hit && now - hit.at < ttlMs) return hit.value;
			evict(now);
			const value = load();
			entries.set(key, { at: now, value });
			// A failed load must not be served from cache until it expires.
			value.catch(() => entries.delete(key));
			return value;
		},
		get size() {
			return entries.size;
		},
	};
}
