import { beforeEach, describe, expect, it, vi } from "vitest";

const { store } = vi.hoisted(() => ({ store: new Map<string, string>() }));

vi.mock("@capacitor/preferences", () => ({
	Preferences: {
		get: vi.fn(async ({ key }: { key: string }) => ({ value: store.get(key) ?? null })),
		set: vi.fn(async ({ key, value }: { key: string; value: string }) => {
			store.set(key, value);
		}),
		remove: vi.fn(async ({ key }: { key: string }) => {
			store.delete(key);
		}),
	},
}));
vi.mock("../auth-client", () => ({ SYNC_URL: "https://lesefluss.test", syncAuthClient: null }));
const { unregisterPush } = vi.hoisted(() => ({ unregisterPush: vi.fn(async () => {}) }));
vi.mock("../../push", () => ({ unregisterPush, clearDeliveredPushes: vi.fn(async () => {}) }));

import { retryPendingSignOut } from "../index";

const KEY = "sync_pending_sign_out";

function answerSignOut(statusFor: (bearer: string) => number) {
	const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
		const bearer = String((init.headers as Record<string, string>).Authorization).slice(7);
		return new Response(null, { status: statusFor(bearer) });
	});
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

describe("retryPendingSignOut", () => {
	beforeEach(() => {
		store.clear();
		unregisterPush.mockClear();
		vi.unstubAllGlobals();
	});

	it("sends the JSON content type the sign-out endpoint requires", async () => {
		store.set(KEY, JSON.stringify(["a"]));
		const fetchMock = answerSignOut(() => 200);
		await retryPendingSignOut();
		const init = fetchMock.mock.calls[0]?.[1];
		expect(init?.headers).toMatchObject({ "Content-Type": "application/json" });
	});

	it("ends every pending session and keeps the ones the server could not take yet", async () => {
		store.set(KEY, JSON.stringify(["a", "b", "c"]));
		answerSignOut((bearer) => ({ a: 200, b: 429, c: 415 })[bearer] ?? 200);
		await retryPendingSignOut();
		expect(JSON.parse(store.get(KEY) ?? "[]")).toEqual(["b", "c"]);
		expect(unregisterPush).toHaveBeenCalledOnce();
	});

	it("forgets a session the server no longer knows", async () => {
		store.set(KEY, JSON.stringify(["gone"]));
		answerSignOut(() => 401);
		await retryPendingSignOut();
		expect(store.has(KEY)).toBe(false);
	});

	it("leaves the token alone when someone signed in since", async () => {
		store.set(KEY, JSON.stringify(["old"]));
		store.set("sync_token", "new-account");
		answerSignOut(() => 200);
		await retryPendingSignOut();
		expect(unregisterPush).not.toHaveBeenCalled();
	});

	it("shares one attempt between concurrent calls", async () => {
		store.set(KEY, JSON.stringify(["a"]));
		const fetchMock = answerSignOut(() => 200);
		await Promise.all([retryPendingSignOut(), retryPendingSignOut()]);
		expect(fetchMock).toHaveBeenCalledOnce();
	});

	it("keeps everything while offline", async () => {
		store.set(KEY, JSON.stringify(["a"]));
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new TypeError("Failed to fetch");
			}),
		);
		await retryPendingSignOut();
		expect(JSON.parse(store.get(KEY) ?? "[]")).toEqual(["a"]);
		expect(unregisterPush).not.toHaveBeenCalled();
	});
});
