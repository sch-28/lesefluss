import { Capacitor } from "@capacitor/core";

/**
 * Throttle timing helper for adapters: pick `native` ms when running on a real
 * device (each phone is its own IP, so a lighter pace looks like a normal
 * reader) and `catalog` ms on web (every browser funnels through the
 * `/proxy/article` endpoint and shares the catalog server's IP, so we keep
 * the gate conservative to avoid the upstream rate-limiting our backend).
 */
export function platformThrottleMs(native: number, catalog: number): number {
	return Capacitor.isNativePlatform() ? native : catalog;
}

/**
 * Per-key rate-limit gate. Each adapter awaits `throttle('ao3', 5000)`
 * before fetching; the gate guarantees at least `minMs` elapses between any
 * two resolved `throttle()` calls for the same key.
 *
 * Keys are arbitrary strings so adapters can carve sub-gates off the main
 * provider gate (e.g. `'scribblehub:toc'` for cheap admin-ajax fragments
 * paced separately from the heavier HTML/chapter pages).
 *
 * Implemented as a chained-promise queue so concurrent callers serialize —
 * a `Promise.all(ids.map(fetchAndStoreChapter))` will pace correctly.
 */
const queues = new Map<string, Promise<void>>();

export function throttle(key: string, minMs: number): Promise<void> {
	const previous = queues.get(key) ?? Promise.resolve();
	const slot = previous.then(() => new Promise<void>((resolve) => setTimeout(resolve, minMs)));
	queues.set(key, slot);
	return previous;
}

/**
 * Test-only escape hatch — clears the per-provider queue map so tests in the
 * same file don't inherit residual chains from earlier cases. Production code
 * MUST NOT call this; the queue is module-scoped on purpose.
 */
export function _resetForTests(): void {
	queues.clear();
}
