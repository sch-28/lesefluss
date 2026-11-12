import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WEB_FOREGROUND_SYNC_MIN_MS, watchWebForeground } from "../web-foreground-sync";

let clock = 0;
let visibility: DocumentVisibilityState = "visible";
let online = true;
let stop: (() => void) | undefined;

beforeEach(() => {
	clock = 100_000;
	visibility = "visible";
	online = true;
	vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
	vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
});

afterEach(() => {
	stop?.();
	stop = undefined;
});

function watch(sync = vi.fn(async () => {})) {
	stop = watchWebForeground(sync, () => clock);
	return sync;
}

const show = () => {
	visibility = "visible";
	document.dispatchEvent(new Event("visibilitychange"));
};
const settle = () => new Promise((r) => setTimeout(r, 0));
const reconnect = () => {
	online = true;
	window.dispatchEvent(new Event("online"));
};

describe("watchWebForeground", () => {
	it("syncs when the tab comes back", () => {
		const sync = watch();
		show();
		expect(sync).toHaveBeenCalledOnce();
	});

	it("syncs when the network comes back", () => {
		const sync = watch();
		reconnect();
		expect(sync).toHaveBeenCalledOnce();
	});

	it("shares one interval between coming back and reconnecting", async () => {
		const sync = watch();
		show();
		await settle();
		clock += WEB_FOREGROUND_SYNC_MIN_MS - 1;
		reconnect();
		show();
		expect(sync).toHaveBeenCalledOnce();
		clock += 1;
		reconnect();
		expect(sync).toHaveBeenCalledTimes(2);
	});

	it("skips offline without spending the interval", () => {
		const sync = watch();
		online = false;
		show();
		expect(sync).not.toHaveBeenCalled();
		reconnect();
		expect(sync).toHaveBeenCalledOnce();
	});

	it("waits for a hidden tab to come back", () => {
		const sync = watch();
		visibility = "hidden";
		reconnect();
		document.dispatchEvent(new Event("visibilitychange"));
		expect(sync).not.toHaveBeenCalled();
		show();
		expect(sync).toHaveBeenCalledOnce();
	});

	it("never runs two syncs at once", async () => {
		let finish = () => {};
		const sync = watch(vi.fn(() => new Promise<void>((r) => (finish = r))));
		show();
		clock += WEB_FOREGROUND_SYNC_MIN_MS;
		reconnect();
		expect(sync).toHaveBeenCalledOnce();
		finish();
		await settle();
		reconnect();
		expect(sync).toHaveBeenCalledTimes(2);
	});

	it("stops listening when stopped", () => {
		const sync = watch();
		stop?.();
		show();
		reconnect();
		expect(sync).not.toHaveBeenCalled();
	});
});
