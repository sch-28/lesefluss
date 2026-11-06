import type { SyncPushStamps } from "@lesefluss/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/preferences", () => {
	const store = new Map<string, string>();
	return {
		Preferences: {
			get: vi.fn(async ({ key }: { key: string }) => ({ value: store.get(key) ?? null })),
			set: vi.fn(async ({ key, value }: { key: string; value: string }) => {
				store.set(key, value);
			}),
			remove: vi.fn(async ({ key }: { key: string }) => {
				store.delete(key);
			}),
		},
	};
});

vi.mock("../auth-client", () => ({ SYNC_URL: "https://lesefluss.app", syncAuthClient: null }));

vi.mock("../session", async (importOriginal) => ({
	...(await importOriginal<typeof import("../session")>()),
	isSyncReady: vi.fn(async () => true),
	hasAdoptedServerSettings: vi.fn(async () => true),
}));

const FAST = 9_000_000;
const CLAMPED = 2_000_000;

const { book, adoptBookStamps, adoptSettingsStamp } = vi.hoisted(() => ({
	book: {
		id: "b1",
		title: "Book",
		author: null,
		fileFormat: "epub",
		size: 1,
		wordCount: 1000,
		wordPosition: 100,
		chapterStatus: "fetched",
		deleted: false,
		updatedAt: 9_000_000,
		metadataUpdatedAt: 9_000_000,
	},
	adoptBookStamps: vi.fn(async () => {}),
	adoptSettingsStamp: vi.fn(async () => {}),
}));

vi.mock("../../db/queries", () => ({
	queries: {
		getBooksForSync: vi.fn(async () => [book]),
		getBookContent: vi.fn(async () => undefined),
		getSettings: vi.fn(async () => ({
			readerFontSize: 16,
			syncHighlights: true,
			syncGlossary: true,
			syncStats: true,
			updatedAt: 9_000_000,
		})),
		getAllHighlights: vi.fn(async () => []),
		getAllEntries: vi.fn(async () => []),
		getSeriesForSync: vi.fn(async () => []),
		getAllGoalsForSync: vi.fn(async () => []),
		getAllCollectionsForSync: vi.fn(async () => []),
		getAllCollectionBooksForSync: vi.fn(async () => []),
		getReadingSessionsSince: vi.fn(async () => []),
		adoptBookStamps,
		adoptSettingsStamp,
	},
}));

const { answer } = vi.hoisted(() => ({ answer: { current: (): Response => new Response() } }));
vi.mock("../../authed-fetch", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../authed-fetch")>()),
	authedFetch: vi.fn(async () => answer.current()),
}));

import { decideExternalPosition } from "../../../pages/reader/external-position";
import { AuthedFetchError } from "../../authed-fetch";
import { bookKeys } from "../../db/hooks/query-keys";
import type { Book } from "../../db/schema";
import { isOwnRevision, onLoweredRevision } from "../../position-revisions";
import { queryClient } from "../../query-client";
import { pushSync } from "../index";

const stamps: SyncPushStamps = {
	books: [{ bookId: "b1", updatedAt: CLAMPED, metadataUpdatedAt: CLAMPED }],
	settingsUpdatedAt: CLAMPED,
};

beforeEach(() => {
	adoptBookStamps.mockClear();
	adoptSettingsStamp.mockClear();
	queryClient.clear();
});

function cacheBook(cached: Book): void {
	queryClient.setQueryData(bookKeys.detail(cached.id), cached);
	queryClient.setQueryData(bookKeys.all, { books: [cached], covers: new Map() });
	queryClient.setQueryData(bookKeys.allIncludingChapters, [cached]);
}

function cachedStamps(): unknown[] {
	const detail = queryClient.getQueryData<Book>(bookKeys.detail("b1"));
	const list = queryClient.getQueryData<{ books: Book[] }>(bookKeys.all);
	const all = queryClient.getQueryData<Book[]>(bookKeys.allIncludingChapters);
	return [detail, list?.books[0], all?.[0]].map((row) =>
		row ? [row.updatedAt, row.metadataUpdatedAt] : null,
	);
}

describe("push from a clock running ahead", () => {
	it("adopts the stamps the server clamped the push to", async () => {
		answer.current = () => Response.json(stamps);
		await pushSync(new Set(["b1"]));
		expect(adoptBookStamps).toHaveBeenCalledWith(
			"b1",
			expect.objectContaining({ updatedAt: FAST, metadataUpdatedAt: FAST }),
			stamps.books[0],
		);
		expect(adoptSettingsStamp).toHaveBeenCalledWith(FAST, CLAMPED);
	});

	it("tells an open reader its position revision went down", async () => {
		const lowered: unknown[] = [];
		const off = onLoweredRevision((...args) => lowered.push(args));
		answer.current = () => Response.json(stamps);
		await pushSync(new Set(["b1"]));
		off();
		expect(lowered).toEqual([["b1", FAST, CLAMPED]]);
	});

	it("lowers the cached library rows too, so a reader opened from them seeds the adopted stamp", async () => {
		cacheBook(book as unknown as Book);
		answer.current = () => Response.json(stamps);
		await pushSync(new Set(["b1"]));
		expect(cachedStamps()).toEqual(Array(3).fill([CLAMPED, CLAMPED]));
	});

	it("keeps a cached stamp that is no longer the pushed one", async () => {
		const SAVED_DURING_PUSH = FAST + 1;
		cacheBook({ ...book, updatedAt: SAVED_DURING_PUSH } as unknown as Book);
		answer.current = () => Response.json(stamps);
		await pushSync(new Set(["b1"]));
		expect(cachedStamps()).toEqual(Array(3).fill([SAVED_DURING_PUSH, CLAMPED]));
	});

	it("lets a reopened book take another device's newer position", async () => {
		cacheBook(book as unknown as Book);
		answer.current = () => Response.json(stamps);
		await pushSync(new Set(["b1"]));

		// The library's onOpen seeds the reader's detail entry from this list row.
		const seed = queryClient.getQueryData<{ books: Book[] }>(bookKeys.all)?.books[0];
		const OTHER_DEVICE = CLAMPED + 1_000;
		const decision = decideExternalPosition(
			{ wordPosition: 500, updatedAt: OTHER_DEVICE },
			{
				seenRev: seed?.updatedAt ?? 0,
				isOwnRevision: (rev) => isOwnRevision("b1", rev),
				ourWord: seed?.wordPosition ?? null,
				hasLocalMove: false,
				isRsvpPlaying: false,
				isReadAloudPlaying: false,
				isSkippedForPlaybackSave: false,
			},
		);
		expect(decision).toBe("adopt");
	});

	it("adopts them from a quota 413 too, where the rest of the push was committed", async () => {
		const body = {
			error: "Storage quota exceeded",
			code: "content_quota_exceeded",
			rejectedContentBookIds: [],
			usedBytes: 0,
			quotaBytes: 0,
			stamps,
		};
		answer.current = () => {
			throw new AuthedFetchError(413, JSON.stringify(body), body);
		};
		await pushSync(new Set(["b1"]));
		expect(adoptBookStamps).toHaveBeenCalledTimes(1);
	});
});

describe("push from a correct clock, or to an older server", () => {
	it("changes no stamp on a 204", async () => {
		answer.current = () => new Response(null, { status: 204 });
		await pushSync(new Set(["b1"]));
		expect(adoptBookStamps).not.toHaveBeenCalled();
		expect(adoptSettingsStamp).not.toHaveBeenCalled();
	});

	it("ignores an answer it cannot read", async () => {
		answer.current = () => Response.json({ books: "nope" });
		await pushSync(new Set(["b1"]));
		expect(adoptBookStamps).not.toHaveBeenCalled();
		expect(adoptSettingsStamp).not.toHaveBeenCalled();
	});
});
