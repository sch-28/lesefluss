import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const preferenceStore = new Map<string, string>();

vi.mock("@capacitor/preferences", () => ({
	Preferences: {
		get: vi.fn(async ({ key }: { key: string }) => ({ value: preferenceStore.get(key) ?? null })),
		set: vi.fn(async ({ key, value }: { key: string; value: string }) => {
			preferenceStore.set(key, value);
		}),
		remove: vi.fn(async ({ key }: { key: string }) => {
			preferenceStore.delete(key);
		}),
	},
}));

vi.mock("../auth-client", () => ({
	SYNC_URL: "https://lesefluss.app",
	syncAuthClient: null,
}));

import {
	beginAuthLoginHandoff,
	consumeAuthLoginHandoffState,
	finalizeVerifiedAuthLoginHandoff,
} from "../index";

describe("Capacitor auth handoff", () => {
	beforeEach(() => {
		preferenceStore.clear();
		vi.stubGlobal("crypto", { randomUUID: () => "state-1" });
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("stores and consumes the same state key used by the existing mobile flow", async () => {
		await expect(beginAuthLoginHandoff()).resolves.toBe("state-1");
		expect(preferenceStore.get("sync_auth_state")).toBe("state-1");
		await expect(consumeAuthLoginHandoffState()).resolves.toBe("state-1");
		await expect(consumeAuthLoginHandoffState()).resolves.toBeNull();
	});

	it("stores verified token and email in the existing Preferences keys", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ user: { email: "reader@example.com" } }),
		});
		vi.stubGlobal("fetch", fetchMock);

		await expect(finalizeVerifiedAuthLoginHandoff("session-token")).resolves.toEqual({
			email: "reader@example.com",
		});

		expect(preferenceStore.get("sync_token")).toBe("session-token");
		expect(preferenceStore.get("sync_user_email")).toBe("reader@example.com");
		expect(fetchMock).toHaveBeenCalledWith("https://lesefluss.app/api/auth/get-session", {
			headers: { Authorization: "Bearer session-token" },
		});
	});
});
