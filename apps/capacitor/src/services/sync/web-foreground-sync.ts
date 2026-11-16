// A web tab left open in the background would otherwise push its stale
// position over newer reading from another device on its next save.
export const WEB_FOREGROUND_SYNC_MIN_MS = 30_000;

/**
 * Runs `sync` when the tab comes back to the foreground or the network comes
 * back, at most once per WEB_FOREGROUND_SYNC_MIN_MS for both together (LESE-20.4).
 * An offline or hidden tab skips without spending the interval.
 */
export function watchWebForeground(sync: () => Promise<void>, now = Date.now): () => void {
	let lastRun = Number.NEGATIVE_INFINITY;
	let running = false;
	const trigger = async () => {
		if (document.visibilityState !== "visible" || !navigator.onLine || running) return;
		if (now() - lastRun < WEB_FOREGROUND_SYNC_MIN_MS) return;
		lastRun = now();
		running = true;
		try {
			await sync();
		} finally {
			running = false;
		}
	};
	const onVisibility = () => void trigger();
	const onOnline = () => void trigger();
	document.addEventListener("visibilitychange", onVisibility);
	window.addEventListener("online", onOnline);
	return () => {
		document.removeEventListener("visibilitychange", onVisibility);
		window.removeEventListener("online", onOnline);
	};
}
