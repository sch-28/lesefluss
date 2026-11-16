// @vitest-environment node
//
// Bookmarks through the sync route, against a real Postgres database.
// Skipped when DATABASE_URL is unset; point it at a throwaway database.
import { randomUUID } from "node:crypto";
import type {
	SyncBook,
	SyncBookmark,
	SyncPayload,
	SyncResponse,
	SyncSeries,
} from "@lesefluss/core";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { db } from "~/db";
import { user } from "~/db/auth-schema";
import { syncBookmarks, syncBooks, syncSeries } from "~/db/schema";
import { purgeCloudData } from "~/lib/account-deletion";
import { tombstoneBook } from "~/lib/moderation/takedown";
import { Route as SyncRoute } from "~/routes/api/sync";

vi.mock("~/lib/mailer", () => ({ sendMail: vi.fn(async () => {}) }));
vi.mock("~/lib/session-middleware", () => ({ requireAuth: {} }));

const hasDb = Boolean(process.env.DATABASE_URL);

type Handler = (ctx: { request: Request; context: { user: { id: string } } }) => Promise<Response>;
const syncHandlers = (SyncRoute.options.server as unknown as { handlers: Record<string, Handler> })
	.handlers;

describe.skipIf(!hasDb)("sync route bookmarks (integration)", () => {
	const userId = `test-bookmarks-${randomUUID().slice(0, 8)}`;

	beforeAll(async () => {
		vi.stubEnv("ORIGIN_KEY_SECRET", "test");
		await db.insert(user).values({ id: userId, name: "Marks", email: `${userId}@example.test` });
	});

	beforeEach(async () => {
		await db.delete(syncBookmarks).where(eq(syncBookmarks.userId, userId));
		await db.delete(syncBooks).where(eq(syncBooks.userId, userId));
		await db.delete(syncSeries).where(eq(syncSeries.userId, userId));
	});

	afterAll(async () => {
		vi.unstubAllEnvs();
		await db.delete(syncBookmarks).where(eq(syncBookmarks.userId, userId));
		await db.delete(syncBooks).where(eq(syncBooks.userId, userId));
		await db.delete(syncSeries).where(eq(syncSeries.userId, userId));
		await db.delete(user).where(eq(user.id, userId));
	});

	async function push(extra: Partial<SyncPayload>) {
		const payload: SyncPayload = {
			books: [],
			settings: null,
			highlights: [],
			glossaryEntries: [],
			series: [],
			readingSessions: [],
			...extra,
		};
		const res = await syncHandlers.POST({
			request: new Request("https://lesefluss.test/api/sync", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			}),
			context: { user: { id: userId } },
		});
		expect(res.ok).toBe(true);
	}

	async function pull(): Promise<SyncBookmark[]> {
		const res = await syncHandlers.GET({
			request: new Request("https://lesefluss.test/api/sync"),
			context: { user: { id: userId } },
		});
		const data = (await res.json()) as SyncResponse;
		return [...(data.bookmarks ?? [])].sort((a, b) => a.bookmarkId.localeCompare(b.bookmarkId));
	}

	function book(overrides: Partial<SyncBook> = {}): SyncBook {
		return {
			bookId: "deadbeef",
			title: "A book",
			author: null,
			fileSize: 10,
			wordCount: 1000,
			wordPosition: 0,
			chapterStatus: "fetched",
			deleted: false,
			updatedAt: 1_000,
			...overrides,
		};
	}

	function mark(overrides: Partial<SyncBookmark> = {}): SyncBookmark {
		return {
			bookmarkId: "b1",
			bookId: "deadbeef",
			word: 420,
			label: null,
			deleted: false,
			createdAt: 1_000,
			updatedAt: 1_000,
			...overrides,
		};
	}

	test("a pushed bookmark comes back on pull with its word and label", async () => {
		await push({ books: [book()], bookmarks: [mark({ label: "Chapter 3" })] });
		expect(await pull()).toEqual([mark({ label: "Chapter 3" })]);
	});

	test("a push without bookmarks, as from an older app, leaves them intact", async () => {
		await push({ books: [book()], bookmarks: [mark()] });
		await push({ books: [book({ wordPosition: 50, updatedAt: 2_000 })] });
		expect(await pull()).toEqual([mark()]);
	});

	test("a newer edit wins and an older push does not undo it", async () => {
		await push({ books: [book()], bookmarks: [mark()] });
		await push({ books: [book()], bookmarks: [mark({ label: "Renamed", updatedAt: 2_000 })] });
		await push({ books: [book()], bookmarks: [mark()] });
		expect(await pull()).toEqual([mark({ label: "Renamed", updatedAt: 2_000 })]);
	});

	test("a deleted bookmark stays deleted when a device still holding it pushes it later", async () => {
		await push({ books: [book()], bookmarks: [mark()] });
		await push({ books: [book()], bookmarks: [mark({ deleted: true, updatedAt: 2_000 })] });
		await push({ books: [book()], bookmarks: [mark({ label: "Stale edit", updatedAt: 3_000 })] });
		const [row] = await pull();
		expect(row).toMatchObject({ bookmarkId: "b1", deleted: true, label: null });
	});

	test("a delete wins over an edit stamped after it", async () => {
		await push({ books: [book()], bookmarks: [mark({ label: "Edited", updatedAt: 3_000 })] });
		await push({ books: [book()], bookmarks: [mark({ deleted: true, updatedAt: 2_000 })] });
		const [row] = await pull();
		expect(row).toMatchObject({ deleted: true, updatedAt: 3_000 });
	});

	test("deleting the book tombstones its bookmarks, even from a client that sends none", async () => {
		await push({
			books: [book(), book({ bookId: "cafebabe" })],
			bookmarks: [mark(), mark({ bookmarkId: "b2", bookId: "cafebabe" })],
		});
		await push({ books: [book({ deleted: true, updatedAt: 2_000 })] });
		const rows = await pull();
		expect(rows.map((r) => [r.bookmarkId, r.deleted])).toEqual([
			["b1", true],
			["b2", false],
		]);
	});

	test("a bookmark pushed for a book already deleted on the server is stored as deleted", async () => {
		await push({ books: [book({ deleted: true, updatedAt: 2_000 })] });
		await push({ books: [], bookmarks: [mark({ updatedAt: 3_000 })] });
		expect((await pull())[0]?.deleted).toBe(true);
	});

	test("deleting a serial tombstones the bookmarks in its chapters", async () => {
		const serial: SyncSeries = {
			seriesId: "5e5e5e5e",
			title: "A serial",
			author: null,
			description: null,
			sourceUrl: "https://example.test/serial",
			tocUrl: "https://example.test/serial/toc",
			provider: "rss",
			lastCheckedAt: null,
			createdAt: 1_000,
			deleted: false,
			updatedAt: 1_000,
		};
		const chapter = book({ bookId: "c0c0c0c0", seriesId: serial.seriesId, chapterIndex: 0 });
		await push({ books: [chapter], series: [serial], bookmarks: [mark({ bookId: "c0c0c0c0" })] });
		await push({ series: [{ ...serial, deleted: true, updatedAt: 2_000 }] });
		expect((await pull())[0]?.deleted).toBe(true);
	});

	test("a takedown of the book tombstones its bookmarks", async () => {
		await push({ books: [book()], bookmarks: [mark()] });
		await db.transaction((tx) => tombstoneBook(tx, userId, "deadbeef", new Date()));
		expect((await pull())[0]?.deleted).toBe(true);
	});

	test("Clear cloud data removes the bookmarks", async () => {
		await push({ books: [book()], bookmarks: [mark()] });
		await db.transaction((tx) => purgeCloudData(tx, userId));
		expect(await pull()).toEqual([]);
	});

	test("rejects a malformed bookmark with a 400", async () => {
		const res = await syncHandlers.POST({
			request: new Request("https://lesefluss.test/api/sync", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					books: [],
					settings: null,
					highlights: [],
					bookmarks: [{ ...mark(), word: -1 }],
				}),
			}),
			context: { user: { id: userId } },
		});
		expect(res.status).toBe(400);
	});
});
