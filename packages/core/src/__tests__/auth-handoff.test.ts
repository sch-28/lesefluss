import { describe, expect, it, vi } from "vitest";
import {
	type AuthHandoffStorage,
	beginAuthHandoff,
	consumeAuthHandoffState,
	finalizeVerifiedAuthHandoffLogin,
} from "../auth-handoff";

function createMemoryStorage(): AuthHandoffStorage & { data: Map<string, string> } {
	const data = new Map<string, string>();
	return {
		data,
		async get(key) {
			return data.get(key) ?? null;
		},
		async set(key, value) {
			data.set(key, value);
		},
		async remove(key) {
			data.delete(key);
		},
	};
}

function createDeferred<T = void>(): {
	promise: Promise<T>;
	resolve: (value: T | PromiseLike<T>) => void;
} {
	let resolve: (value: T | PromiseLike<T>) => void = () => {};
	const promise = new Promise<T>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}

describe("auth handoff", () => {
	it("begins and consumes state once", async () => {
		const storage = createMemoryStorage();

		await expect(beginAuthHandoff(storage, { generateState: () => "state-1" })).resolves.toBe(
			"state-1",
		);
		await expect(consumeAuthHandoffState(storage)).resolves.toBe("state-1");
		await expect(consumeAuthHandoffState(storage)).resolves.toBeNull();
	});

	it("returns null for concurrent consume calls while preserving single-use state", async () => {
		const releaseGet = createDeferred();
		const getStarted = createDeferred();
		const storage = createMemoryStorage();
		storage.data.set("sync_auth_state", "state-1");
		const originalGet = storage.get.bind(storage);
		storage.get = async (key) => {
			getStarted.resolve();
			await releaseGet.promise;
			return originalGet(key);
		};

		const first = consumeAuthHandoffState(storage);
		await getStarted.promise;
		const second = consumeAuthHandoffState(storage);
		releaseGet.resolve();

		await expect(second).resolves.toBeNull();
		await expect(first).resolves.toBe("state-1");
		await expect(consumeAuthHandoffState(storage)).resolves.toBeNull();
	});

	it("does not block different storage adapters that use the same state key", async () => {
		const releaseGet = createDeferred();
		const getStarted = createDeferred();
		const firstStorage = createMemoryStorage();
		const secondStorage = createMemoryStorage();
		firstStorage.data.set("sync_auth_state", "state-1");
		secondStorage.data.set("sync_auth_state", "state-2");
		const originalGet = firstStorage.get.bind(firstStorage);
		firstStorage.get = async (key) => {
			getStarted.resolve();
			await releaseGet.promise;
			return originalGet(key);
		};

		const first = consumeAuthHandoffState(firstStorage);
		await getStarted.promise;
		await expect(consumeAuthHandoffState(secondStorage)).resolves.toBe("state-2");
		releaseGet.resolve();
		await expect(first).resolves.toBe("state-1");
	});

	it("stores token and verified email", async () => {
		const storage = createMemoryStorage();
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ user: { email: "reader@example.com" } }),
		});

		await expect(
			finalizeVerifiedAuthHandoffLogin(storage, {
				token: "session-token",
				syncUrl: "https://lesefluss.app",
				fetch: fetchMock,
			}),
		).resolves.toEqual({ email: "reader@example.com" });

		expect(storage.data.get("sync_token")).toBe("session-token");
		expect(storage.data.get("sync_user_email")).toBe("reader@example.com");
		expect(fetchMock).toHaveBeenCalledWith("https://lesefluss.app/api/auth/get-session", {
			headers: { Authorization: "Bearer session-token" },
		});
	});

	it("clears stored auth when session verification fails", async () => {
		const storage = createMemoryStorage();
		storage.data.set("sync_auth_state", "state-1");
		const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401 });

		await expect(
			finalizeVerifiedAuthHandoffLogin(storage, {
				token: "session-token",
				syncUrl: "https://lesefluss.app",
				fetch: fetchMock,
			}),
		).rejects.toThrow("Failed to verify session (401)");

		expect(storage.data.has("sync_token")).toBe(false);
		expect(storage.data.has("sync_user_email")).toBe(false);
		expect(storage.data.has("sync_auth_state")).toBe(false);
	});

	it("clears stored auth when session verification throws", async () => {
		const storage = createMemoryStorage();
		storage.data.set("sync_auth_state", "state-1");
		const fetchMock = vi.fn().mockRejectedValue(new TypeError("offline"));

		await expect(
			finalizeVerifiedAuthHandoffLogin(storage, {
				token: "session-token",
				syncUrl: "https://lesefluss.app",
				fetch: fetchMock,
			}),
		).rejects.toThrow("offline");

		expect(storage.data.has("sync_token")).toBe(false);
		expect(storage.data.has("sync_user_email")).toBe(false);
		expect(storage.data.has("sync_auth_state")).toBe(false);
	});

	it("clears stored auth when session JSON parsing throws", async () => {
		const storage = createMemoryStorage();
		storage.data.set("sync_auth_state", "state-1");
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => {
				throw new SyntaxError("bad json");
			},
		});

		await expect(
			finalizeVerifiedAuthHandoffLogin(storage, {
				token: "session-token",
				syncUrl: "https://lesefluss.app",
				fetch: fetchMock,
			}),
		).rejects.toThrow("bad json");

		expect(storage.data.has("sync_token")).toBe(false);
		expect(storage.data.has("sync_user_email")).toBe(false);
		expect(storage.data.has("sync_auth_state")).toBe(false);
	});
});
