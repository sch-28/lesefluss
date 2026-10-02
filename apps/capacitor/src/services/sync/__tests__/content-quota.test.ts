import { type ContentQuotaExceeded, type SyncPayload, wordPos } from "@lesefluss/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Book } from "../../db/schema";

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

const books: Book[] = [];
vi.mock("../../db/queries", () => ({
	queries: {
		getBooksForSync: vi.fn(async () => books),
		getSettings: vi.fn(async () => ({
			syncHighlights: true,
			syncGlossary: true,
			syncStats: true,
			updatedAt: 0,
		})),
		getAllHighlights: vi.fn(async () => []),
		getAllEntries: vi.fn(async () => []),
		getSeriesForSync: vi.fn(async () => []),
		getReadingSessionsSince: vi.fn(async () => []),
		getBookContent: vi.fn(async () => ({
			content: "text",
			coverImage: null,
			chapters: null,
			linkRanges: null,
		})),
	},
}));

const pushed: SyncPayload[] = [];
const fetchResult: { rejection: ContentQuotaExceeded | null } = { rejection: null };
vi.mock("../../authed-fetch", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../../authed-fetch")>();
	return {
		...actual,
		authedFetch: vi.fn(async (_path: string, options?: { body?: string }) => {
			if (options?.body) pushed.push(JSON.parse(options.body));
			const { rejection } = fetchResult;
			if (rejection) {
				throw new actual.AuthedFetchError(413, JSON.stringify(rejection), rejection);
			}
			return new Response(null, { status: 204 });
		}),
	};
});

import { getQuotaBlock, quotaHasMoreRoom, reconcileQuotaBlock } from "../content-quota";
import { pushSync } from "../index";
import { getServerContentIds } from "../server-content-cache";
import { LAST_SYNCED_KEY } from "../session";

function makeBook(id: string): Book {
	return {
		id,
		title: "T",
		author: null,
		fileFormat: "txt",
		filePath: null,
		size: 10,
		wordPosition: wordPos(5),
		wordCount: 0,
		isActive: false,
		addedAt: 0,
		lastRead: null,
		finishedAt: null,
		source: null,
		catalogId: null,
		sourceUrl: null,
		deleted: false,
		seriesId: null,
		chapterIndex: null,
		chapterSourceUrl: null,
		chapterStatus: "fetched",
		chapterError: null,
		description: null,
		language: null,
		status: null,
		rating: null,
		review: null,
		tags: null,
		hideFromProfile: false,
		originKey: null,
		updatedAt: 0,
		metadataUpdatedAt: 0,
	};
}

const rejection = (ids: string[]): ContentQuotaExceeded => ({
	error: "Storage quota exceeded",
	code: "content_quota_exceeded",
	rejectedContentBookIds: ids,
	usedBytes: 990,
	quotaBytes: 1_000,
});

describe("push against a full account", () => {
	beforeEach(async () => {
		preferenceStore.clear();
		pushed.length = 0;
		books.length = 0;
		fetchResult.rejection = null;
		await reconcileQuotaBlock({ usedBytes: 0, quotaBytes: Number.MAX_SAFE_INTEGER });
	});

	it("completes the push and stops offering the refused content", async () => {
		books.push(makeBook("aaaaaaaa"), makeBook("bbbbbbbb"));
		fetchResult.rejection = rejection(["bbbbbbbb"]);

		await expect(pushSync(new Set())).resolves.toBeUndefined();

		expect(preferenceStore.get(LAST_SYNCED_KEY)).toBeDefined();
		expect([...(await getServerContentIds())]).toEqual(["aaaaaaaa"]);
		expect((await getQuotaBlock())?.bookIds).toEqual(["bbbbbbbb"]);

		fetchResult.rejection = null;
		await pushSync(new Set(["aaaaaaaa"]));
		const second = pushed[1]?.books.find((b) => b.bookId === "bbbbbbbb");
		expect(second?.content).toBeUndefined();
		expect(second?.wordPosition).toBe(5);
	});

	it("offers the content again once a pull shows more room", async () => {
		books.push(makeBook("bbbbbbbb"));
		fetchResult.rejection = rejection(["bbbbbbbb"]);
		await pushSync(new Set());

		await reconcileQuotaBlock({ usedBytes: 990, quotaBytes: 1_000 });
		expect(await getQuotaBlock()).not.toBeNull();

		await reconcileQuotaBlock({ usedBytes: 500, quotaBytes: 1_000 });
		expect(await getQuotaBlock()).toBeNull();

		fetchResult.rejection = null;
		await pushSync(new Set());
		expect(pushed.at(-1)?.books[0]?.content).toBe("text");
	});

	it("still fails a push on any other error", async () => {
		books.push(makeBook("aaaaaaaa"));
		fetchResult.rejection = { ...rejection(["aaaaaaaa"]), code: "other" } as never;
		await expect(pushSync(new Set())).rejects.toThrow("Sync failed (413)");
		expect(preferenceStore.get(LAST_SYNCED_KEY)).toBeUndefined();
	});
});

describe("quotaHasMoreRoom", () => {
	it("is true only when free space grew since the refusal", () => {
		const block = { bookIds: ["a"], freeBytes: 10 };
		expect(quotaHasMoreRoom(block, { usedBytes: 990, quotaBytes: 1_000 })).toBe(false);
		expect(quotaHasMoreRoom(block, { usedBytes: 989, quotaBytes: 1_000 })).toBe(true);
		expect(quotaHasMoreRoom(block, { usedBytes: 990, quotaBytes: 2_000 })).toBe(true);
	});
});
