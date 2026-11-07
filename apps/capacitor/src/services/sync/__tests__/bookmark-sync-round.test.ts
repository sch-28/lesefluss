import { type SyncPayload, type SyncResponse, wordPos } from "@lesefluss/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Book, Bookmark } from "../../db/schema";

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

const local: Bookmark = {
	id: "b1",
	bookId: "deadbeef",
	word: wordPos(420),
	label: null,
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

const upsertBookmarks = vi.fn(async (_rows: Bookmark[]) => {});
const hardDeleteBookmarks = vi.fn(async (_ids: string[]) => {});
vi.mock("../../db/queries", () => ({
	queries: {
		getBooksForSync: vi.fn(async () => [book]),
		getSettings: vi.fn(async () => ({
			syncHighlights: false,
			syncGlossary: false,
			syncStats: false,
		})),
		getAllHighlights: vi.fn(async () => []),
		getAllEntries: vi.fn(async () => []),
		getSeriesForSync: vi.fn(async () => []),
		getReadingSessionsSince: vi.fn(async () => []),
		getSpeedTests: vi.fn(async () => []),
		getAllGoalsForSync: vi.fn(async () => []),
		getAllCollectionsForSync: vi.fn(async () => []),
		getAllCollectionBooksForSync: vi.fn(async () => []),
		getAllSmartShelvesForSync: vi.fn(async () => []),
		getAllBookmarksForSync: vi.fn(async () => [local]),
		getAllWishlistForSync: vi.fn(async () => []),
		upsertGoals: vi.fn(async () => {}),
		hardDeleteGoals: vi.fn(async () => {}),
		resolveActiveGoalConflicts: vi.fn(async () => {}),
		completeFinishedGoals: vi.fn(async () => {}),
		upsertReadingSessions: vi.fn(async () => {}),
		upsertBookmarks: (rows: Bookmark[]) => upsertBookmarks(rows),
		hardDeleteBookmarks: (ids: string[]) => hardDeleteBookmarks(ids),
	},
}));

const pushed: SyncPayload[] = [];
let pullResponse: SyncResponse;
vi.mock("../../authed-fetch", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../authed-fetch")>()),
	authedFetch: vi.fn(async (_path: string, options?: { body?: string }) => {
		if (options?.body) {
			pushed.push(JSON.parse(options.body));
			return new Response(null, { status: 204 });
		}
		return Response.json(pullResponse);
	}),
}));

const { pullSync, pushSync } = await import("../index");

beforeEach(() => {
	preferenceStore.clear();
	pushed.length = 0;
	upsertBookmarks.mockClear();
	hardDeleteBookmarks.mockClear();
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

describe("bookmarks in a sync round", () => {
	it("a push carries the bookmarks of the books it pushes", async () => {
		await pushSync(new Set(["deadbeef"]));
		expect(pushed[0]?.bookmarks).toEqual([
			{
				bookmarkId: "b1",
				bookId: "deadbeef",
				word: 420,
				label: null,
				deleted: false,
				createdAt: 1_000,
				updatedAt: 1_000,
			},
		]);
	});

	it("a pull lands another device's bookmark and drops one deleted there", async () => {
		pullResponse.bookmarks = [
			{
				bookmarkId: "b2",
				bookId: "deadbeef",
				word: 77,
				label: "Mine",
				deleted: false,
				createdAt: 2_000,
				updatedAt: 2_000,
			},
			{
				bookmarkId: "b1",
				bookId: "deadbeef",
				word: 420,
				label: null,
				deleted: true,
				createdAt: 1_000,
				updatedAt: 3_000,
			},
		];
		await pullSync();
		expect(upsertBookmarks).toHaveBeenCalledWith([
			expect.objectContaining({ id: "b2", bookId: "deadbeef", word: 77, label: "Mine" }),
		]);
		expect(hardDeleteBookmarks).toHaveBeenCalledWith(["b1"]);
	});

	it("a pull from a server that pre-dates bookmarks leaves them alone", async () => {
		await pullSync();
		expect(upsertBookmarks).not.toHaveBeenCalled();
		expect(hardDeleteBookmarks).not.toHaveBeenCalled();
	});
});
