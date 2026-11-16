import { DELETE_SESSIONS_BATCH_MAX } from "@lesefluss/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/preferences", () => ({
	Preferences: { get: vi.fn(async () => ({ value: null })), set: vi.fn(), remove: vi.fn() },
}));
vi.mock("../auth-client", () => ({ SYNC_URL: "https://lesefluss.app", syncAuthClient: null }));

const isSyncReady = vi.hoisted(() => vi.fn(async () => true));
vi.mock("../session", async (importOriginal) => ({
	...(await importOriginal<typeof import("../session")>()),
	isSyncReady,
}));

const order: string[] = [];
const deleteReadingSessions = vi.hoisted(() => vi.fn());
const notifySessionsDeleted = vi.hoisted(() => vi.fn());
vi.mock("../../db/queries", () => ({ queries: { deleteReadingSessions } }));
vi.mock("../../reading-sessions/deleted", () => ({ notifySessionsDeleted }));

const calls: Array<{ path: string; body: unknown }> = [];
let batchStatus: number | "unreachable" | null = null;
let gate: Promise<void> | null = null;
let signedOutBefore: string | null = null;
vi.mock("../../authed-fetch", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../../authed-fetch")>();
	return {
		...actual,
		authedFetch: vi.fn(async (path: string, options?: { body?: string }) => {
			calls.push({ path, body: options?.body ? JSON.parse(options.body) : null });
			order.push("server");
			if (gate) await gate;
			const status = batchStatus;
			if (path === "/api/sync/delete-session" && options?.body?.includes(`"${signedOutBefore}"`)) {
				throw new Error("Not authenticated");
			}
			if (path === "/api/sync/delete-sessions" && status === "unreachable") {
				throw new TypeError("Failed to fetch");
			}
			if (path === "/api/sync/delete-sessions" && typeof status === "number") {
				throw new actual.AuthedFetchError(status, "nope", null);
			}
			return Response.json({ ok: true });
		}),
	};
});

const { deleteReadingSessionsEverywhere, deleteServerSessions } = await import("../index");

const ids = (n: number) => Array.from({ length: n }, (_, i) => `s${i}`);

beforeEach(() => {
	calls.length = 0;
	order.length = 0;
	batchStatus = null;
	gate = null;
	signedOutBefore = null;
	isSyncReady.mockResolvedValue(true);
	deleteReadingSessions.mockReset().mockImplementation(async () => {
		order.push("local");
	});
	notifySessionsDeleted.mockReset().mockImplementation(() => {
		order.push("notify");
	});
});

describe("deleteServerSessions", () => {
	it("sends the ids in batches the server accepts", async () => {
		await deleteServerSessions(ids(DELETE_SESSIONS_BATCH_MAX + 3));
		expect(calls.map((c) => c.path)).toEqual([
			"/api/sync/delete-sessions",
			"/api/sync/delete-sessions",
		]);
		expect(calls.map((c) => (c.body as { sessionIds: string[] }).sessionIds.length)).toEqual([
			DELETE_SESSIONS_BATCH_MAX,
			3,
		]);
	});

	it("falls back to one call per id on a server without the batch endpoint", async () => {
		batchStatus = 404;
		await deleteServerSessions(["a", "b"]);
		expect(calls).toEqual([
			{ path: "/api/sync/delete-sessions", body: { sessionIds: ["a", "b"] } },
			{ path: "/api/sync/delete-session", body: { sessionId: "a" } },
			{ path: "/api/sync/delete-session", body: { sessionId: "b" } },
		]);
	});

	it("falls back when the missing route's 404 reaches the native app as a CORS failure", async () => {
		batchStatus = "unreachable";
		await deleteServerSessions(["a"]);
		expect(calls.map((c) => c.path)).toEqual([
			"/api/sync/delete-sessions",
			"/api/sync/delete-session",
		]);
	});

	it("fails on any other server error, without the fallback", async () => {
		batchStatus = 500;
		await expect(deleteServerSessions(["a"])).rejects.toThrow("Sync failed (500)");
		expect(calls).toHaveLength(1);
	});

	it("sends nothing while sync is off", async () => {
		isSyncReady.mockResolvedValue(false);
		await deleteServerSessions(["a"]);
		expect(calls).toEqual([]);
	});
});

describe("deleteReadingSessionsEverywhere", () => {
	it("tombstones on the server, tells the reader, then deletes here", async () => {
		await deleteReadingSessionsEverywhere(["a", "b"]);
		expect(order).toEqual(["server", "notify", "local"]);
		expect(deleteReadingSessions).toHaveBeenCalledWith(["a", "b"]);
		expect(notifySessionsDeleted).toHaveBeenCalledWith(["a", "b"]);
	});

	it("keeps the rows here when the server call fails", async () => {
		batchStatus = 500;
		await expect(deleteReadingSessionsEverywhere(["a"])).rejects.toThrow("Sync failed (500)");
		expect(deleteReadingSessions).not.toHaveBeenCalled();
		expect(notifySessionsDeleted).not.toHaveBeenCalled();
	});

	it("holds the sync lock, so nothing else syncs between the server and the local delete", async () => {
		let open: () => void = () => {};
		gate = new Promise((resolve) => {
			open = resolve;
		});
		const first = deleteReadingSessionsEverywhere(["a"]);
		const second = deleteReadingSessionsEverywhere(["b"]);
		await vi.waitFor(() => expect(order).toEqual(["server"]));
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(order).toEqual(["server"]);
		gate = null;
		open();
		await Promise.all([first, second]);
		expect(order).toEqual(["server", "notify", "local", "server", "notify", "local"]);
	});

	it("keeps the rows here when the session ends partway through the one-by-one fallback", async () => {
		batchStatus = 404;
		signedOutBefore = "b";
		isSyncReady.mockResolvedValueOnce(true).mockResolvedValue(false);
		await expect(deleteReadingSessionsEverywhere(["a", "b", "c"])).rejects.toThrow(
			"Not authenticated",
		);
		expect(deleteReadingSessions).not.toHaveBeenCalled();
	});

	it("does nothing for no ids", async () => {
		await deleteReadingSessionsEverywhere([]);
		expect(order).toEqual([]);
	});
});
