import { type SyncPayload, type SyncResponse, wordPos } from "@lesefluss/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Book, ReadingGoal } from "../../db/schema";

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

const goal: ReadingGoal = {
	id: "g1",
	bookId: "deadbeef",
	mode: "deadline",
	status: "active",
	startedAt: 1_000,
	startWord: wordPos(0),
	planStartDate: "2026-03-01",
	planStartWord: wordPos(0),
	targetDate: "2026-03-10",
	dailyPercent: 10,
	carriedDaysMet: 0,
	completedAt: null,
	reminderTime: null,
	deleted: false,
	createdAt: 1_000,
	updatedAt: 1_000,
};

const book = {
	id: "deadbeef",
	title: "Book",
	author: null,
	size: 10,
	wordCount: 1000,
	wordPosition: wordPos(0),
	seriesId: null,
	deleted: false,
	updatedAt: 1_000,
	metadataUpdatedAt: 1_000,
	addedAt: 1_000,
	lastRead: null,
	finishedAt: null,
	originKey: null,
} as unknown as Book;

const settings = { syncHighlights: false, syncGlossary: false, syncStats: true, updatedAt: 0 };

const upsertGoals = vi.fn(async (_rows: ReadingGoal[]) => {});
vi.mock("../../db/queries", () => ({
	queries: {
		getBooksForSync: vi.fn(async () => [book]),
		getSettings: vi.fn(async () => settings),
		getAllHighlights: vi.fn(async () => []),
		getAllEntries: vi.fn(async () => []),
		getSeriesForSync: vi.fn(async () => []),
		getReadingSessionsSince: vi.fn(async () => []),
		upsertReadingSessions: vi.fn(async () => {}),
		getAllGoalsForSync: vi.fn(async () => [goal]),
		upsertGoals: (rows: ReadingGoal[]) => upsertGoals(rows),
		hardDeleteGoals: vi.fn(async () => {}),
		resolveActiveGoalConflicts: vi.fn(async () => {}),
		completeFinishedGoals: vi.fn(async () => {}),
	},
}));

const pushed: SyncPayload[] = [];
const posted: string[] = [];
const pullResponse: SyncResponse = {
	books: [],
	settings: null,
	highlights: [],
	glossaryEntries: [],
	series: [],
	readingSessions: [],
	contentBookIds: [],
};
vi.mock("../../authed-fetch", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../authed-fetch")>()),
	authedFetch: vi.fn(async (path: string, options?: { body?: string; method?: string }) => {
		if (options?.method === "POST" && !options.body) {
			posted.push(path);
			return Response.json({ ok: true });
		}
		if (options?.body) {
			pushed.push(JSON.parse(options.body));
			return new Response(null, { status: 204 });
		}
		return Response.json(pullResponse);
	}),
}));

const { goalToSync, pullSync, pushSync } = await import("../index");

beforeEach(() => {
	preferenceStore.clear();
	pushed.length = 0;
	posted.length = 0;
	upsertGoals.mockClear();
	pullResponse.readingGoals = [goalToSync({ ...goal, targetDate: "2026-04-01", updatedAt: 2_000 })];
});

describe("goal sync follows the stats opt-out", () => {
	it("pushes and pulls goals while stats sync is on", async () => {
		settings.syncStats = true;
		await pushSync(new Set(["deadbeef"]));
		expect(pushed[0]?.readingGoals?.map((g) => g.goalId)).toEqual(["g1"]);
		await pullSync();
		expect(upsertGoals).toHaveBeenCalledOnce();
	});

	it("neither pushes nor pulls goals while stats sync is off", async () => {
		settings.syncStats = false;
		await pushSync(new Set(["deadbeef"]));
		expect(pushed[0]?.readingGoals).toBeUndefined();
		await pullSync();
		expect(upsertGoals).not.toHaveBeenCalled();
	});

	it("removes the server's goals once after stats sync goes off, and again after each re-enable", async () => {
		settings.syncStats = true;
		await pushSync(new Set(["deadbeef"]));
		expect(posted).toEqual([]);
		settings.syncStats = false;
		await pushSync(new Set(["deadbeef"]));
		await pushSync(new Set(["deadbeef"]));
		expect(posted.filter((p) => p.endsWith("/api/sync/wipe-goals"))).toHaveLength(1);

		settings.syncStats = true;
		await pushSync(new Set(["deadbeef"]));
		settings.syncStats = false;
		await pushSync(new Set(["deadbeef"]));
		expect(posted.filter((p) => p.endsWith("/api/sync/wipe-goals"))).toHaveLength(2);
	});
});
