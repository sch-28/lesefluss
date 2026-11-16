import type { DbDriver } from "./types";

export interface TrackedDriver {
	driver: DbDriver;
	/**
	 * Resolves once no statement has been running for `quietMs`, or after
	 * `maxMs` at the latest. A quiet stretch rather than a single idle moment:
	 * the write queue starts its next statement a tick after the last one ends.
	 */
	settled(quietMs: number, maxMs: number): Promise<void>;
}

const STATEMENT_METHODS = ["run", "query", "execute", "begin", "commit", "rollback"] as const;
const POLL_MS = 25;

export function trackCalls(inner: DbDriver): TrackedDriver {
	let running = 0;
	let lastActive = Date.now();

	const driver: DbDriver = { ...inner };
	for (const method of STATEMENT_METHODS) {
		const call = inner[method] as (...args: unknown[]) => Promise<unknown>;
		(driver as unknown as Record<string, unknown>)[method] = async (...args: unknown[]) => {
			running++;
			try {
				return await call(...args);
			} finally {
				running--;
				lastActive = Date.now();
			}
		};
	}

	return {
		driver,
		async settled(quietMs, maxMs) {
			const deadline = Date.now() + maxMs;
			lastActive = Math.max(lastActive, Date.now());
			while (Date.now() < deadline) {
				if (running === 0 && Date.now() - lastActive >= quietMs) return;
				await new Promise((r) => setTimeout(r, POLL_MS));
			}
		},
	};
}
