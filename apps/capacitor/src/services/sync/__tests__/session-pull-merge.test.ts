// @vitest-environment node
import type { SyncReadingSession, SyncResponse } from "@lesefluss/core";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../../db/__tests__/test-db";

const { db, raw, close } = createTestDb();
vi.mock("../../db/index", () => ({
	get db() {
		return db;
	},
}));
afterAll(close);

vi.mock("@capacitor/preferences", () => {
	const store = new Map<string, string>();
	return {
		Preferences: {
			get: async ({ key }: { key: string }) => ({ value: store.get(key) ?? null }),
			set: async ({ key, value }: { key: string; value: string }) => {
				store.set(key, value);
			},
			remove: async ({ key }: { key: string }) => {
				store.delete(key);
			},
		},
	};
});
// The e2e hook writes to `window`, which this node environment lacks.
vi.mock("../../../test-hooks/sync", () => ({ exposeRemoteSettingsApply: () => {} }));
vi.mock("../auth-client", () => ({ SYNC_URL: "https://lesefluss.app", syncAuthClient: null }));
vi.mock("../session", async (importOriginal) => ({
	...(await importOriginal<typeof import("../session")>()),
	isSyncReady: vi.fn(async () => true),
}));

let pullResponse: SyncResponse;
vi.mock("../../authed-fetch", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../authed-fetch")>()),
	authedFetch: vi.fn(async () => Response.json(pullResponse)),
}));

const { pullSync } = await import("../index");

function serverSession(sessionId: string, updatedAt: number): SyncReadingSession {
	return {
		sessionId,
		bookId: "deadbeef",
		mode: "scroll",
		startedAt: 1_000,
		endedAt: 61_000,
		durationMs: 60_000,
		wordsRead: 120,
		startWord: 0,
		endWord: 120,
		furthestWord: 120,
		wpmAvg: 120,
		updatedAt,
	};
}

function insertLocal(id: string, updatedAt: number) {
	raw
		.prepare(
			`INSERT INTO reading_sessions
			 (id, book_id, mode, started_at, ended_at, duration_ms, words_read, start_word, end_word, wpm_avg, updated_at)
			 VALUES (?, 'deadbeef', 'scroll', 1000, 61000, 60000, 50, 0, 50, NULL, ?)`,
		)
		.run(id, updatedAt);
}

function localRows() {
	return raw.prepare("SELECT id, words_read FROM reading_sessions ORDER BY id").all() as {
		id: string;
		words_read: number;
	}[];
}

beforeEach(() => {
	raw.exec("DELETE FROM reading_sessions");
	raw.exec("UPDATE settings SET sync_stats = 1");
});

describe("pulling sessions into the local database", () => {
	it("upserts live rows and deletes tombstoned ones", async () => {
		insertLocal("kept", 1_000);
		insertLocal("updated", 1_000);
		insertLocal("deleted", 1_000);
		pullResponse = {
			books: [],
			settings: null,
			highlights: [],
			glossaryEntries: [],
			series: [],
			readingSessions: [serverSession("updated", 5_000), serverSession("new", 5_000)],
			deletedSessionIds: ["deleted", "never-here"],
			deletedSessionIdsAsOf: 9_000,
		};
		await pullSync();
		expect(localRows()).toEqual([
			{ id: "kept", words_read: 50 },
			{ id: "new", words_read: 120 },
			{ id: "updated", words_read: 120 },
		]);
	});

	it("lets the tombstone win for an id listed both live and deleted", async () => {
		pullResponse = {
			books: [],
			settings: null,
			highlights: [],
			glossaryEntries: [],
			series: [],
			readingSessions: [serverSession("both", 5_000)],
			deletedSessionIds: ["both"],
			deletedSessionIdsAsOf: 9_000,
		};
		await pullSync();
		expect(localRows()).toEqual([]);
	});
});
