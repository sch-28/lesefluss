// @vitest-environment node
//
// The per-account content quota on every write path, against a real Postgres
// database. Skipped when DATABASE_URL is unset; point it at a throwaway database.
import { randomUUID } from "node:crypto";
import type { SyncBook, SyncPayload } from "@lesefluss/core";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { db } from "~/db";
import { user } from "~/db/auth-schema";
import { syncBookCopy, syncBooks, syncSettings } from "~/db/schema";
import { Route as SyncRoute } from "~/routes/api/sync";
import { handleArticleImportRequest } from "./article-import";
import { contentUsage } from "./content-quota";
import { copyBookForUser } from "./social/copy-book";

vi.mock("~/lib/mailer", () => ({ sendMail: vi.fn(async () => {}) }));
// The handlers are called directly with a user; auth would need OAuth env to even load.
vi.mock("~/lib/session-middleware", () => ({ requireAuth: {} }));

const hasDb = Boolean(process.env.DATABASE_URL);
const QUOTA = 1_000;

type Handler = (ctx: { request: Request; context: { user: { id: string } } }) => Promise<Response>;
const syncHandlers = (SyncRoute.options.server as unknown as { handlers: Record<string, Handler> })
	.handlers;

describe.skipIf(!hasDb)("content quota (integration)", () => {
	const run = randomUUID().slice(0, 8);
	const owner = `test-quota-a-${run}`;
	const friend = `test-quota-b-${run}`;
	const all = [owner, friend];
	let nextId = 0;
	const bookId = () => (0x10000000 + nextId++).toString(16);

	beforeAll(async () => {
		await db
			.insert(user)
			.values(all.map((id) => ({ id, name: `Name ${id}`, email: `${id}@example.test` })));
	});

	beforeEach(() => {
		vi.stubEnv("SYNC_CONTENT_QUOTA_BYTES", String(QUOTA));
		vi.stubEnv("ORIGIN_KEY_SECRET", "test");
	});

	afterEach(async () => {
		vi.unstubAllEnvs();
		await db.delete(syncBookCopy).where(inArray(syncBookCopy.userId, all));
		await db.delete(syncBooks).where(inArray(syncBooks.userId, all));
		await db.delete(syncSettings).where(inArray(syncSettings.userId, all));
	});

	afterAll(async () => {
		await db.delete(user).where(inArray(user.id, all));
	});

	async function seed(
		userId: string,
		bytes: number,
		overrides: Partial<typeof syncBooks.$inferInsert> = {},
	) {
		const id = bookId();
		await db.insert(syncBooks).values({
			userId,
			bookId: id,
			originUserId: userId,
			originBookId: id,
			title: "Seeded",
			content: "x".repeat(bytes),
			updatedAt: new Date(1_000),
			...overrides,
		});
		return id;
	}

	async function row(userId: string, id: string) {
		const [r] = await db
			.select()
			.from(syncBooks)
			.where(and(eq(syncBooks.userId, userId), eq(syncBooks.bookId, id)));
		return r;
	}

	function syncBook(id: string, overrides: Partial<SyncBook> = {}): SyncBook {
		return {
			bookId: id,
			title: "Pushed",
			author: null,
			fileSize: 0,
			wordCount: null,
			wordPosition: 0,
			chapterStatus: "fetched",
			deleted: false,
			updatedAt: 2_000,
			...overrides,
		};
	}

	function push(userId: string, books: SyncBook[]) {
		const payload: SyncPayload = {
			books,
			settings: null,
			highlights: [],
			glossaryEntries: [],
			series: [],
			readingSessions: [],
		};
		return syncHandlers.POST({
			request: new Request("https://lesefluss.test/api/sync", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			}),
			context: { user: { id: userId } },
		});
	}

	function importArticle(userId: string, html: string, id = bookId()) {
		return handleArticleImportRequest(
			new Request("https://lesefluss.test/api/import/article", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ html, url: "https://example.com/read", title: "Article" }),
			}),
			userId,
			{ generateBookId: () => id, checkLimit: () => ({ ok: true }) },
		);
	}

	test("sync push: a new book that lands exactly at the cap is stored", async () => {
		await seed(owner, 900);
		const id = bookId();
		const res = await push(owner, [syncBook(id, { content: "y".repeat(100) })]);
		expect(res.status).toBe(204);
		expect((await row(owner, id))?.content).toHaveLength(100);
		expect(await contentUsage(db, owner)).toBe(QUOTA);
	});

	test("sync push: over the cap, the content is refused with 413 but position and the rest still sync", async () => {
		const stored = await seed(owner, 900);
		const id = bookId();
		const res = await push(owner, [
			syncBook(stored, { wordPosition: 42 }),
			syncBook(id, { content: "y".repeat(101), wordPosition: 7 }),
		]);

		expect(res.status).toBe(413);
		await expect(res.json()).resolves.toEqual({
			error: "Storage quota exceeded",
			code: "content_quota_exceeded",
			rejectedContentBookIds: [id],
			usedBytes: 900,
			quotaBytes: QUOTA,
		});
		expect((await row(owner, stored))?.wordPosition).toBe(42);
		const refused = await row(owner, id);
		expect(refused?.wordPosition).toBe(7);
		expect(refused?.content).toBeNull();
		expect(await contentUsage(db, owner)).toBe(900);
	});

	test("sync push: re-pushing a stored book's content does not count it twice", async () => {
		const stored = await seed(owner, 900);
		const res = await push(owner, [syncBook(stored, { content: "z".repeat(900) })]);
		expect(res.status).toBe(204);
		expect(await contentUsage(db, owner)).toBe(900);
	});

	test("sync push: a stored book re-pushed with larger blobs over the cap keeps its blobs, takes the rest", async () => {
		const stored = await seed(owner, 900, { coverImage: "c".repeat(10), chapters: "[]" });
		const res = await push(owner, [
			syncBook(stored, {
				title: "Renamed",
				wordPosition: 99,
				content: "y".repeat(950),
				coverImage: "d".repeat(50),
				chapters: "[1,2,3]",
			}),
		]);

		expect(res.status).toBe(413);
		await expect(res.json()).resolves.toMatchObject({ rejectedContentBookIds: [stored] });
		const after = await row(owner, stored);
		expect(after?.content).toBe("x".repeat(900));
		expect(after?.coverImage).toBe("c".repeat(10));
		expect(after?.chapters).toBe("[]");
		expect(after?.title).toBe("Renamed");
		expect(after?.wordPosition).toBe(99);
		expect(await contentUsage(db, owner)).toBe(912);
	});

	test("sync push: two parallel pushes that together exceed the cap admit exactly one", async () => {
		await seed(owner, 400);
		const [a, b] = [bookId(), bookId()];
		const results = await Promise.all([
			push(owner, [syncBook(a, { content: "a".repeat(400) })]),
			push(owner, [syncBook(b, { content: "b".repeat(400) })]),
		]);

		expect(results.map((r) => r.status).sort()).toEqual([204, 413]);
		const stored = [await row(owner, a), await row(owner, b)].filter((r) => r?.content);
		expect(stored).toHaveLength(1);
		expect(await contentUsage(db, owner)).toBe(800);
	});

	test("sync push: a tombstone in the same push frees room for a new book", async () => {
		const doomed = await seed(owner, 900);
		const id = bookId();
		const res = await push(owner, [
			syncBook(doomed, { deleted: true }),
			syncBook(id, { content: "y".repeat(500) }),
		]);
		expect(res.status).toBe(204);
		expect(await contentUsage(db, owner)).toBe(500);
	});

	test("sync pull reports usage against the quota", async () => {
		await seed(owner, 300);
		await seed(owner, 200, { deleted: true });
		const res = await syncHandlers.GET({
			request: new Request("https://lesefluss.test/api/sync"),
			context: { user: { id: owner } },
		});
		await expect(res.json()).resolves.toMatchObject({
			contentQuota: { usedBytes: 300, quotaBytes: QUOTA },
		});
	});

	test("article import: at the cap is stored, one byte over is refused with 413", async () => {
		const body = "<html><body><article><p>Hello there.</p></article></body></html>";
		const probe = await importArticle(friend, body);
		expect(probe.status).toBe(200);
		const articleBytes = await contentUsage(db, friend);
		await db.delete(syncBooks).where(eq(syncBooks.userId, friend));

		await seed(owner, QUOTA - articleBytes);
		const atCap = await importArticle(owner, body);
		expect(atCap.status).toBe(200);
		expect(await contentUsage(db, owner)).toBe(QUOTA);

		await db.delete(syncBooks).where(eq(syncBooks.userId, owner));
		await seed(owner, QUOTA - articleBytes + 1);
		const overId = bookId();
		const over = await importArticle(owner, body, overId);
		expect(over.status).toBe(413);
		await expect(over.json()).resolves.toMatchObject({
			code: "content_quota_exceeded",
			usedBytes: QUOTA - articleBytes + 1,
			quotaBytes: QUOTA,
		});
		expect(await row(owner, overId)).toBeUndefined();
	});

	test("a shared copy counts against the recipient and is refused into a full account", async () => {
		const source = await seed(owner, 400);
		await seed(friend, 600);
		const fits = await db.transaction((tx) =>
			copyBookForUser(tx, {
				sourceUserId: owner,
				sourceBookId: source,
				recipientId: friend,
				via: "share",
			}),
		);
		expect(fits.created).toBe(true);
		expect(await contentUsage(db, friend)).toBe(QUOTA);

		const another = await seed(owner, 1);
		await expect(
			db.transaction((tx) =>
				copyBookForUser(tx, {
					sourceUserId: owner,
					sourceBookId: another,
					recipientId: friend,
					via: "share",
				}),
			),
		).rejects.toMatchObject({ code: "quota_exceeded", status: 413 });
	});
});
