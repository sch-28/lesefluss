import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock("@capacitor/app", () => ({
	App: { getLaunchUrl: async () => ({ url: "" }) },
}));

beforeEach(() => {
	vi.resetModules();
});
afterEach(() => {
	vi.useRealTimers();
});

async function settled(promise: Promise<unknown>): Promise<boolean> {
	let done = false;
	void promise.then(() => {
		done = true;
	});
	await vi.advanceTimersByTimeAsync(0);
	return done;
}

describe("launchHasIntent", () => {
	it("waits for both the push and the reminder tap listeners", async () => {
		vi.useFakeTimers();
		const intent = await import("../launch-intent");
		const answer = intent.launchHasIntent();

		intent.markPushListenersAttached();
		expect(await settled(answer)).toBe(false);

		// A cold-start reminder tap is delivered as soon as its listener attaches.
		intent.markNotificationTapReceived();
		intent.markReminderListenersAttached();
		expect(await answer).toBe(true);
	});

	it("goes on without listeners that never attach", async () => {
		vi.useFakeTimers();
		const intent = await import("../launch-intent");
		const answer = intent.launchHasIntent();
		await vi.advanceTimersByTimeAsync(3_000);
		expect(await answer).toBe(false);
	});
});
