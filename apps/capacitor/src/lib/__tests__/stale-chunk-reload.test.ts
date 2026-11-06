import { beforeEach, describe, expect, it, vi } from "vitest";
import { installStaleChunkReload, type ReloadRouter, reloadOnceFor } from "../stale-chunk-reload";

function fakeWindow(storage: Pick<Storage, "getItem" | "setItem"> = sessionStorage, onLine = true) {
	const reload = vi.fn();
	const win = Object.assign(new EventTarget(), {
		sessionStorage: storage,
		location: { reload },
		navigator: { onLine },
	});
	return { win: win as unknown as Window, reload };
}

function fakeRouter() {
	const listeners: Array<() => void> = [];
	const router: ReloadRouter = {
		state: { isLoading: false },
		history: { flush: vi.fn() },
		subscribe: (_event, fn) => {
			listeners.push(fn);
			return () => {};
		},
	};
	const navigate = () => {
		for (const fn of listeners) fn();
	};
	return { router, navigate };
}

function preloadError(win: Window, chunk: string) {
	const event = Object.assign(new Event("vite:preloadError", { cancelable: true }), {
		payload: new TypeError(`Failed to fetch dynamically imported module: /app/assets/${chunk}`),
	});
	win.dispatchEvent(event);
}

describe("stale chunk reload", () => {
	beforeEach(() => sessionStorage.clear());

	it("reloads at once for a failure during a navigation, once per failing chunk", () => {
		const { win, reload } = fakeWindow();
		const { router } = fakeRouter();
		installStaleChunkReload(router, win);
		router.state.isLoading = true;

		preloadError(win, "stats-a.js");
		preloadError(win, "stats-a.js");
		expect(reload).toHaveBeenCalledTimes(1);

		preloadError(win, "epub-b.js");
		expect(reload).toHaveBeenCalledTimes(2);
	});

	it("defers a failure outside a navigation to the next navigation", () => {
		const { win, reload } = fakeWindow();
		const { router, navigate } = fakeRouter();
		installStaleChunkReload(router, win);

		preloadError(win, "stats-a.js");
		expect(reload).not.toHaveBeenCalled();

		navigate();
		expect(router.history.flush).toHaveBeenCalled();
		expect(reload).toHaveBeenCalledTimes(1);
		navigate();
		expect(reload).toHaveBeenCalledTimes(1);
	});

	it("never reloads offline or when the session flag cannot be stored", () => {
		const offline = fakeWindow(sessionStorage, false);
		expect(reloadOnceFor(new TypeError("x"), offline.win)).toBe(false);

		const noStorage = fakeWindow({
			getItem: () => null,
			setItem: () => {
				throw new Error("storage disabled");
			},
		});
		expect(reloadOnceFor(new TypeError("x"), noStorage.win)).toBe(false);

		expect(offline.reload).not.toHaveBeenCalled();
		expect(noStorage.reload).not.toHaveBeenCalled();
	});
});
