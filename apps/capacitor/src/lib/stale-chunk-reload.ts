const RELOADED_PREFIX = "lesefluss:stale-chunk-reload:";

type PreloadErrorEvent = Event & { payload?: unknown };

export type ReloadRouter = {
	state: { isLoading: boolean };
	history: { flush(): void };
	subscribe(event: "onBeforeNavigate", fn: () => void): () => void;
};

function failureKey(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	return `${RELOADED_PREFIX}${message}`;
}

/**
 * Reloads unless this failure already caused one in this tab session, so a
 * chunk still missing after the reload surfaces its error instead of looping.
 * WebKit's message names no chunk, so there it is one reload per session.
 */
export function reloadOnceFor(error: unknown, win: Window = window): boolean {
	// Offline, a reload lands on the browser's error page instead of a new shell.
	if (win.navigator?.onLine === false) return false;
	const key = failureKey(error);
	try {
		if (win.sessionStorage.getItem(key)) return false;
		win.sessionStorage.setItem(key, "1");
	} catch {
		return false;
	}
	// Fires `pagehide`, on which the reader flushes its position synchronously.
	win.location.reload();
	return true;
}

/**
 * A deploy deletes the previous build's chunks, so a tab opened before it fails
 * every lazy import it had not loaded yet. A failure during a navigation reloads
 * at once, on the navigation's target. One outside a navigation, such as a
 * hover preload or a parser import, only marks the tab stale: reloading then
 * would yank the page from under the user, so the next navigation reloads instead.
 */
export function installStaleChunkReload(router: ReloadRouter, win: Window = window): void {
	let staleFailure: unknown = null;
	win.addEventListener("vite:preloadError", (event) => {
		const failure = (event as PreloadErrorEvent).payload;
		if (router.state.isLoading) reloadOnceFor(failure, win);
		else staleFailure ??= failure;
	});
	router.subscribe("onBeforeNavigate", () => {
		if (staleFailure === null) return;
		const failure = staleFailure;
		staleFailure = null;
		// The router batches its URL push into a microtask; without the flush the
		// reload would land back on the page being left.
		router.history.flush();
		reloadOnceFor(failure, win);
	});
}
