import type { SyncResponse } from "@lesefluss/core";
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

vi.mock("../auth-client", () => ({ SYNC_URL: "https://lesefluss.app", syncAuthClient: null }));

vi.mock("../session", async (importOriginal) => ({
	...(await importOriginal<typeof import("../session")>()),
	isSyncReady: vi.fn(async () => true),
}));

vi.mock("../../db/queries", () => ({
	queries: {
		getBooksForSync: vi.fn(async () => []),
		getSettings: vi.fn(async () => ({
			syncHighlights: false,
			syncGlossary: false,
			syncStats: false,
			updatedAt: 0,
		})),
		getSeriesForSync: vi.fn(async () => []),
		getAllGoalsForSync: vi.fn(async () => []),
		upsertGoals: vi.fn(async () => {}),
		hardDeleteGoals: vi.fn(async () => {}),
		resolveActiveGoalConflicts: vi.fn(async () => {}),
		completeFinishedGoals: vi.fn(async () => {}),
	},
}));

const HOUR = 60 * 60_000;
const SERVER = Date.UTC(2026, 10, 6, 10);

let pullResponse: SyncResponse;
vi.mock("../../authed-fetch", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../authed-fetch")>()),
	authedFetch: vi.fn(async () => Response.json(pullResponse)),
}));

const { pullSync } = await import("../index");
const { _resetForTests, serverClockOffset } = await import("../server-clock");

beforeEach(() => {
	preferenceStore.clear();
	_resetForTests();
	vi.useFakeTimers({ toFake: ["Date", "performance"] });
	vi.setSystemTime(SERVER + HOUR);
	pullResponse = {
		books: [],
		settings: null,
		highlights: [],
		glossaryEntries: [],
		series: [],
		readingSessions: [],
		contentBookIds: [],
	};
});

afterEach(() => {
	vi.useRealTimers();
});

describe("the pull", () => {
	it("measures the clock offset from the server's time", async () => {
		pullResponse.serverTime = SERVER;
		await pullSync();
		expect(serverClockOffset()).toBe(-HOUR);
	});

	it("leaves the offset alone when the server sends no time", async () => {
		await pullSync();
		expect(serverClockOffset()).toBe(0);
	});
});
