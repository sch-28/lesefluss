import type { SyncPayload, SyncResponse } from "@lesefluss/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WishlistItem } from "../../db/schema";

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

const local: WishlistItem = {
	id: "w1",
	kind: "catalog",
	ref: "gutenberg:1342",
	title: "Pride and Prejudice",
	author: "Jane Austen",
	coverUrl: null,
	deleted: false,
	createdAt: 1_000,
	updatedAt: 1_000,
};

const upsertWishlist = vi.fn(async (_rows: WishlistItem[]) => {});
const hardDeleteWishlist = vi.fn(async (_ids: string[]) => {});
vi.mock("../../db/queries", () => ({
	queries: {
		getBooksForSync: vi.fn(async () => []),
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
		getAllBookmarksForSync: vi.fn(async () => []),
		getAllWishlistForSync: vi.fn(async () => [local]),
		upsertGoals: vi.fn(async () => {}),
		hardDeleteGoals: vi.fn(async () => {}),
		resolveActiveGoalConflicts: vi.fn(async () => {}),
		completeFinishedGoals: vi.fn(async () => {}),
		upsertReadingSessions: vi.fn(async () => {}),
		upsertWishlist: (rows: WishlistItem[]) => upsertWishlist(rows),
		hardDeleteWishlist: (ids: string[]) => hardDeleteWishlist(ids),
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
	upsertWishlist.mockClear();
	hardDeleteWishlist.mockClear();
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

describe("the wishlist in a sync round", () => {
	it("a push carries the wishlist, with no book in it", async () => {
		await pushSync(new Set());
		expect(pushed[0]?.wishlist).toEqual([
			{
				itemId: "w1",
				kind: "catalog",
				ref: "gutenberg:1342",
				title: "Pride and Prejudice",
				author: "Jane Austen",
				coverUrl: null,
				deleted: false,
				createdAt: 1_000,
				updatedAt: 1_000,
			},
		]);
	});

	it("a pull lands another device's item and drops one removed there", async () => {
		pullResponse.wishlist = [
			{
				itemId: "w2",
				kind: "serial",
				ref: "https://www.royalroad.com/fiction/21220/mother-of-learning",
				title: "Mother of Learning",
				author: null,
				coverUrl: "https://www.royalroadcdn.com/cover.jpg",
				deleted: false,
				createdAt: 2_000,
				updatedAt: 2_000,
			},
			{ ...pushedShape(local), deleted: true, updatedAt: 3_000 },
		];
		await pullSync();
		expect(upsertWishlist).toHaveBeenCalledWith([
			expect.objectContaining({ id: "w2", kind: "serial", title: "Mother of Learning" }),
		]);
		expect(hardDeleteWishlist).toHaveBeenCalledWith(["w1"]);
	});

	it("a pull from a server that pre-dates the wishlist leaves it alone", async () => {
		await pullSync();
		expect(upsertWishlist).not.toHaveBeenCalled();
		expect(hardDeleteWishlist).not.toHaveBeenCalled();
	});
});

function pushedShape(item: WishlistItem) {
	const { id, ...rest } = item;
	return { itemId: id, ...rest };
}
