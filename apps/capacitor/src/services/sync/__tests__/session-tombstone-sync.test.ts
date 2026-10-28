import type { SyncReadingSession, SyncResponse } from "@lesefluss/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReadingSession } from "../../db/schema";

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

vi.mock("../auth-client", () => ({ SYNC_URL: "https://lesefluss.app", syncAuthClient: null }));

vi.mock("../session", async (importOriginal) => ({
	...(await importOriginal<typeof import("../session")>()),
	isSyncReady: vi.fn(async () => true),
}));

const settings = { syncHighlights: false, syncGlossary: false, syncStats: true, updatedAt: 0 };

const upsertReadingSessions = vi.fn(async (_rows: ReadingSession[]) => {});
const deleteReadingSessions = vi.fn(async (_ids: string[]) => {});
const deleteAllReadingSessions = vi.fn(async () => {});
const hardDeleteAllGoals = vi.fn(async () => {});
vi.mock("../../db/queries", () => ({
	queries: {
		getBooksForSync: vi.fn(async () => []),
		getSettings: vi.fn(async () => settings),
		getAllHighlights: vi.fn(async () => []),
		getAllEntries: vi.fn(async () => []),
		getSeriesForSync: vi.fn(async () => []),
		getReadingSessionsSince: vi.fn(async () => []),
		upsertReadingSessions: (rows: ReadingSession[]) => upsertReadingSessions(rows),
		deleteReadingSessions: (ids: string[]) => deleteReadingSessions(ids),
		deleteAllReadingSessions: () => deleteAllReadingSessions(),
		hardDeleteAllGoals: () => hardDeleteAllGoals(),
		getAllGoalsForSync: vi.fn(async () => []),
		upsertGoals: vi.fn(async () => {}),
		hardDeleteGoals: vi.fn(async () => {}),
		resolveActiveGoalConflicts: vi.fn(async () => {}),
		completeFinishedGoals: vi.fn(async () => {}),
	},
}));

const live: SyncReadingSession = {
	sessionId: "live",
	bookId: "deadbeef",
	mode: "scroll",
	startedAt: 1_000,
	endedAt: 61_000,
	durationMs: 60_000,
	wordsRead: 120,
	startWord: 0,
	endWord: 120,
	wpmAvg: 120,
	updatedAt: 61_000,
};

let pullResponse: SyncResponse;
const pulled: string[] = [];
const posted: string[] = [];
let failPosts = false;
let pullGate: Promise<void> = Promise.resolve();
vi.mock("../../authed-fetch", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../authed-fetch")>()),
	authedFetch: vi.fn(async (path: string, options?: { body?: string; method?: string }) => {
		if (options?.method === "POST") {
			posted.push(path);
			if (failPosts) throw new Error("offline");
			return Response.json({ ok: true });
		}
		pulled.push(path);
		await pullGate;
		return Response.json(pullResponse);
	}),
}));

const { pullSync, wipeAllReadingStats } = await import("../index");
const { onSessionsDeleted } = await import("../../reading-sessions/deleted");
const { getSessionTombstoneWatermark } = await import("../session");

beforeEach(() => {
	preferenceStore.clear();
	posted.length = 0;
	pulled.length = 0;
	failPosts = false;
	settings.syncStats = true;
	upsertReadingSessions.mockClear();
	deleteReadingSessions.mockClear();
	deleteAllReadingSessions.mockClear();
	hardDeleteAllGoals.mockClear();
	pullResponse = {
		books: [],
		settings: null,
		highlights: [],
		glossaryEntries: [],
		series: [],
		readingSessions: [live],
		deletedSessionIds: ["gone-1", "gone-2"],
		deletedSessionIdsAsOf: 90_000,
		contentBookIds: [],
	};
});

describe("pulling session tombstones", () => {
	it("drops the deleted sessions locally and upserts only the live ones", async () => {
		await pullSync();
		expect(deleteReadingSessions).toHaveBeenCalledWith(["gone-1", "gone-2"]);
		expect(upsertReadingSessions.mock.calls[0]?.[0].map((row) => row.id)).toEqual(["live"]);
	});

	it("asks only for tombstones newer than the last applied list", async () => {
		await pullSync();
		expect(pulled[0]).toBe("/api/sync?sessionTombstonesSince=0");
		expect(await getSessionTombstoneWatermark()).toBe(90_000);
		await pullSync();
		expect(pulled[1]).toBe("/api/sync?sessionTombstonesSince=90000");
	});

	it("tells an open sitting before its row goes", async () => {
		const order: string[] = [];
		deleteReadingSessions.mockImplementationOnce(async () => {
			order.push("delete");
		});
		const unsubscribe = onSessionsDeleted((ids) => order.push(`notify:${[...ids].join(",")}`));
		await pullSync();
		unsubscribe();
		expect(order).toEqual(["notify:gone-1,gone-2", "delete"]);
	});

	it("leaves local sessions and the tombstone watermark alone while stats sync is off", async () => {
		settings.syncStats = false;
		await pullSync();
		expect(deleteReadingSessions).not.toHaveBeenCalled();
		expect(upsertReadingSessions).not.toHaveBeenCalled();
		expect(await getSessionTombstoneWatermark()).toBe(0);
	});

	it("deletes nothing when an older server sends no tombstones", async () => {
		delete pullResponse.deletedSessionIds;
		delete pullResponse.deletedSessionIdsAsOf;
		await pullSync();
		expect(deleteReadingSessions).not.toHaveBeenCalled();
		expect(upsertReadingSessions).toHaveBeenCalledOnce();
		expect(await getSessionTombstoneWatermark()).toBe(0);
	});

	it("treats a malformed tombstone list as empty but still advances", async () => {
		pullResponse.deletedSessionIds = "gone-1" as unknown as string[];
		await pullSync();
		expect(deleteReadingSessions).toHaveBeenCalledWith([]);
		expect(await getSessionTombstoneWatermark()).toBe(90_000);
	});
});

describe("danger-zone stats wipe", () => {
	it("tombstones on the server, then deletes local sessions and goals", async () => {
		await wipeAllReadingStats();
		expect(posted).toEqual(["/api/sync/wipe-sessions"]);
		expect(deleteAllReadingSessions).toHaveBeenCalledOnce();
		expect(hardDeleteAllGoals).toHaveBeenCalledOnce();
	});

	it("keeps local sessions and goals when the server wipe fails", async () => {
		failPosts = true;
		await expect(wipeAllReadingStats()).rejects.toThrow();
		expect(deleteAllReadingSessions).not.toHaveBeenCalled();
		expect(hardDeleteAllGoals).not.toHaveBeenCalled();
	});

	it("waits for a pull in flight, so its stale rows cannot land after the local delete", async () => {
		const order: string[] = [];
		upsertReadingSessions.mockImplementationOnce(async () => {
			order.push("pull upsert");
		});
		deleteAllReadingSessions.mockImplementationOnce(async () => {
			order.push("wipe delete");
		});
		let release = () => {};
		pullGate = new Promise((resolve) => {
			release = resolve;
		});
		const pull = pullSync();
		await vi.waitFor(() => expect(pulled).toHaveLength(1));
		const wipe = wipeAllReadingStats();
		release();
		await Promise.all([pull, wipe]);
		pullGate = Promise.resolve();
		expect(order).toEqual(["pull upsert", "wipe delete"]);
	});
});
