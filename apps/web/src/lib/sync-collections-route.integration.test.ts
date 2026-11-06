// @vitest-environment node
//
// Collections through the sync route, against a real Postgres database.
// Skipped when DATABASE_URL is unset; point it at a throwaway database.
import { randomUUID } from "node:crypto";
import type {
	SyncCollection,
	SyncCollectionBook,
	SyncPayload,
	SyncResponse,
} from "@lesefluss/core";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { db } from "~/db";
import { user } from "~/db/auth-schema";
import { syncCollectionBooks, syncCollections } from "~/db/schema";
import { Route as SyncRoute } from "~/routes/api/sync";

vi.mock("~/lib/mailer", () => ({ sendMail: vi.fn(async () => {}) }));
// The handlers are called directly with a user; auth would need OAuth env to even load.
vi.mock("~/lib/session-middleware", () => ({ requireAuth: {} }));

const hasDb = Boolean(process.env.DATABASE_URL);

type Handler = (ctx: { request: Request; context: { user: { id: string } } }) => Promise<Response>;
const syncHandlers = (SyncRoute.options.server as unknown as { handlers: Record<string, Handler> })
	.handlers;

describe.skipIf(!hasDb)("sync route collections (integration)", () => {
	const userId = `test-collections-${randomUUID().slice(0, 8)}`;

	beforeAll(async () => {
		vi.stubEnv("ORIGIN_KEY_SECRET", "test");
		await db.insert(user).values({ id: userId, name: "Shelves", email: `${userId}@example.test` });
	});

	afterAll(async () => {
		vi.unstubAllEnvs();
		await db.delete(syncCollections).where(eq(syncCollections.userId, userId));
		await db.delete(syncCollectionBooks).where(eq(syncCollectionBooks.userId, userId));
		await db.delete(user).where(eq(user.id, userId));
	});

	function push(extra: Partial<SyncPayload>) {
		const payload: SyncPayload = {
			books: [],
			settings: null,
			highlights: [],
			glossaryEntries: [],
			series: [],
			readingSessions: [],
			...extra,
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

	async function pull(): Promise<SyncResponse> {
		const res = await syncHandlers.GET({
			request: new Request("https://lesefluss.test/api/sync"),
			context: { user: { id: userId } },
		});
		return (await res.json()) as SyncResponse;
	}

	const shelf: SyncCollection = {
		collectionId: "c1",
		name: "Shelf",
		sortOrder: 1,
		deleted: false,
		createdAt: 1_000,
		updatedAt: 1_000,
	};
	const member = (bookId: string, updatedAt: number): SyncCollectionBook => ({
		collectionId: "c1",
		bookId,
		deleted: false,
		updatedAt,
	});

	test("two devices each adding a book keep both, and the pull returns them", async () => {
		expect(
			(await push({ collections: [shelf], collectionBooks: [member("aaaaaaaa", 2_000)] })).ok,
		).toBe(true);
		expect(
			(await push({ collections: [shelf], collectionBooks: [member("bbbbbbbb", 2_100)] })).ok,
		).toBe(true);
		const data = await pull();
		expect(data.collections).toEqual([shelf]);
		expect(data.collectionBooks?.map((m) => m.bookId).sort()).toEqual(["aaaaaaaa", "bbbbbbbb"]);
	});

	test("a push from an app without collections succeeds and changes nothing", async () => {
		const res = await push({});
		expect(res.ok).toBe(true);
		const data = await pull();
		expect(data.collections).toHaveLength(1);
		expect(data.collectionBooks).toHaveLength(2);
	});
});
