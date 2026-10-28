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
		getAllGoalsForSync: vi.fn(async () => []),
		completeFinishedGoals: vi.fn(async () => {}),
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

import {
	blockAfterPull,
	clearQuotaBlock,
	getContentQuota,
	getQuotaBlock,
	reconcileQuotaBlock,
} from "../content-quota";
import { type NotBackedUpBook, onBooksNotBackedUp, pushSync } from "../index";
import { getServerContentIds } from "../server-content-cache";
import { LAST_SYNCED_KEY } from "../session";

function makeBook(id: string): Book {
	return {
		id,
		title: `Title ${id}`,
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

const rejection = (bytes: Record<string, number>): ContentQuotaExceeded => ({
	error: "Storage quota exceeded",
	code: "content_quota_exceeded",
	rejectedContentBookIds: Object.keys(bytes),
	rejectedContentBytes: bytes,
	usedBytes: 990,
	quotaBytes: 1_000,
});

const live = (...ids: string[]) => new Set(ids);
const none = new Set<string>();

describe("push against a full account", () => {
	beforeEach(async () => {
		preferenceStore.clear();
		pushed.length = 0;
		books.length = 0;
		fetchResult.rejection = null;
		await clearQuotaBlock();
	});

	it("completes the push and stops offering the refused content", async () => {
		books.push(makeBook("aaaaaaaa"), makeBook("bbbbbbbb"));
		fetchResult.rejection = rejection({ bbbbbbbb: 40 });

		await expect(pushSync(new Set())).resolves.toBeUndefined();

		expect(preferenceStore.get(LAST_SYNCED_KEY)).toBeDefined();
		expect([...(await getServerContentIds())]).toEqual(["aaaaaaaa"]);
		expect((await getQuotaBlock())?.books).toEqual({ bbbbbbbb: 40 });
		expect(await getContentQuota()).toEqual({ usedBytes: 990, quotaBytes: 1_000 });

		fetchResult.rejection = null;
		await pushSync(new Set(["aaaaaaaa"]));
		const second = pushed[1]?.books.find((b) => b.bookId === "bbbbbbbb");
		expect(second?.content).toBeUndefined();
		expect(second?.wordPosition).toBe(5);
	});

	it("reports each book once, when it is first refused", async () => {
		const reported: NotBackedUpBook[][] = [];
		const stop = onBooksNotBackedUp((list) => reported.push(list));
		books.push(makeBook("aaaaaaaa"), makeBook("bbbbbbbb"));
		fetchResult.rejection = rejection({ bbbbbbbb: 40 });
		await pushSync(new Set());
		fetchResult.rejection = rejection({ aaaaaaaa: 30, bbbbbbbb: 40 });
		await pushSync(new Set());
		stop();
		expect(reported).toEqual([
			[{ id: "bbbbbbbb", title: "Title bbbbbbbb" }],
			[{ id: "aaaaaaaa", title: "Title aaaaaaaa" }],
		]);
	});

	it("stays quiet when an unblocked book is refused again, until it uploads", async () => {
		const reported: NotBackedUpBook[][] = [];
		const stop = onBooksNotBackedUp((list) => reported.push(list));
		books.push(makeBook("bbbbbbbb"));
		fetchResult.rejection = rejection({ bbbbbbbb: 40 });
		await pushSync(new Set());
		// Room appears, the book is offered again and refused again.
		await reconcileQuotaBlock({ usedBytes: 900, quotaBytes: 1_000 }, none, live("bbbbbbbb"));
		await pushSync(new Set());
		expect(reported).toHaveLength(1);

		// Once it uploads, a later refusal is news again.
		await reconcileQuotaBlock({ usedBytes: 900, quotaBytes: 1_000 }, none, live("bbbbbbbb"));
		fetchResult.rejection = null;
		await pushSync(new Set());
		fetchResult.rejection = rejection({ bbbbbbbb: 40 });
		await pushSync(new Set());
		stop();
		expect(reported).toHaveLength(2);
	});

	it("offers the content again once a pull shows room for that book", async () => {
		books.push(makeBook("bbbbbbbb"));
		fetchResult.rejection = rejection({ bbbbbbbb: 40 });
		await pushSync(new Set());

		await reconcileQuotaBlock({ usedBytes: 970, quotaBytes: 1_000 }, none, live("bbbbbbbb"));
		expect(await getQuotaBlock()).not.toBeNull();

		await reconcileQuotaBlock({ usedBytes: 960, quotaBytes: 1_000 }, none, live("bbbbbbbb"));
		expect(await getQuotaBlock()).toBeNull();

		fetchResult.rejection = null;
		await pushSync(new Set());
		expect(pushed.at(-1)?.books[0]?.content).toBe("text");
	});

	it("reads a block stored before sizes existed as books of unknown size", async () => {
		preferenceStore.set(
			"sync_content_quota_block",
			JSON.stringify({ bookIds: ["bbbbbbbb"], freeBytes: 10 }),
		);
		expect((await getQuotaBlock())?.books).toEqual({ bbbbbbbb: null });
	});

	it("still fails a push on any other error", async () => {
		books.push(makeBook("aaaaaaaa"));
		fetchResult.rejection = { ...rejection({ aaaaaaaa: 1 }), code: "other" } as never;
		await expect(pushSync(new Set())).rejects.toThrow("Sync failed (413)");
		expect(preferenceStore.get(LAST_SYNCED_KEY)).toBeUndefined();
	});
});

describe("blockAfterPull", () => {
	const quota = (free: number) => ({ usedBytes: 1_000 - free, quotaBytes: 1_000 });
	const all = live("a", "b", "c");

	it("lets books through smallest first while the free space covers them", () => {
		const block = { books: { a: 30, b: 10, c: 25 }, freeBytes: 0 };
		expect(blockAfterPull(block, quota(36), none, all)).toEqual({
			books: { a: 30 },
			freeBytes: 36,
		});
	});

	it("keeps every book while none fits", () => {
		const block = { books: { a: 30, b: 20 }, freeBytes: 0 };
		expect(blockAfterPull(block, quota(19), none, all)?.books).toEqual({ a: 30, b: 20 });
	});

	it("lets a book of unknown size through on any growth in free space", () => {
		const block = { books: { a: null }, freeBytes: 10 };
		expect(blockAfterPull(block, quota(10), none, all)?.books).toEqual({ a: null });
		expect(blockAfterPull(block, quota(11), none, all)).toBeNull();
	});

	it("keeps the growth mark for unknown sizes when free space dips", () => {
		const block = { books: { a: null }, freeBytes: 10 };
		const dipped = blockAfterPull(block, quota(4), none, all);
		expect(dipped).toEqual({ books: { a: null }, freeBytes: 10 });
		expect(dipped && blockAfterPull(dipped, quota(8), none, all)).not.toBeNull();
	});

	it("drops books the server now holds or the library no longer has", () => {
		const block = { books: { a: 500, b: 500, c: 500 }, freeBytes: 0 };
		expect(blockAfterPull(block, quota(0), live("a"), live("a", "c"))?.books).toEqual({
			c: 500,
		});
	});
});
