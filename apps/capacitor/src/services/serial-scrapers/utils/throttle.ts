import type { ProviderId } from "../types";

/**
 * Per-provider rate-limit gate. Each adapter awaits `throttle('ao3', 5000)`
 * before fetching; the gate guarantees at least `minMs` elapses between any
 * two resolved `throttle()` calls for the same provider.
 *
 * Implemented as a chained-promise queue so concurrent callers serialize —
 * a `Promise.all(ids.map(fetchAndStoreChapter))` will pace correctly.
 *
 * Per-provider keying: a slow provider can't block another's pipeline. Two
 * concurrent imports of the same provider share the gate, which is the
 * correct behavior — the upstream doesn't care which caller sent the request.
 */
const queues = new Map<ProviderId, Promise<void>>();

export function throttle(provider: ProviderId, minMs: number): Promise<void> {
	const previous = queues.get(provider) ?? Promise.resolve();
	const slot = previous.then(() => new Promise<void>((resolve) => setTimeout(resolve, minMs)));
	queues.set(provider, slot);
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
