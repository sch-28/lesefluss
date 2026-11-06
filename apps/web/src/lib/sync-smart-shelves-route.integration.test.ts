// @vitest-environment node
//
// Smart shelves through the sync route, against a real Postgres database.
// Skipped when DATABASE_URL is unset; point it at a throwaway database.
import { randomUUID } from "node:crypto";
import type { SyncPayload, SyncResponse, SyncSmartShelf } from "@lesefluss/core";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { db } from "~/db";
import { user } from "~/db/auth-schema";
import { syncSmartShelves } from "~/db/schema";
import { Route as SyncRoute } from "~/routes/api/sync";

vi.mock("~/lib/mailer", () => ({ sendMail: vi.fn(async () => {}) }));
vi.mock("~/lib/session-middleware", () => ({ requireAuth: {} }));

const hasDb = Boolean(process.env.DATABASE_URL);

type Handler = (ctx: { request: Request; context: { user: { id: string } } }) => Promise<Response>;
const syncHandlers = (SyncRoute.options.server as unknown as { handlers: Record<string, Handler> })
	.handlers;

describe.skipIf(!hasDb)("sync route smart shelves (integration)", () => {
	const userId = `test-shelves-${randomUUID().slice(0, 8)}`;

	beforeAll(async () => {
		vi.stubEnv("ORIGIN_KEY_SECRET", "test");
		await db.insert(user).values({ id: userId, name: "Shelves", email: `${userId}@example.test` });
	});

	afterAll(async () => {
		vi.unstubAllEnvs();
		await db.delete(syncSmartShelves).where(eq(syncSmartShelves.userId, userId));
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

	const shelf: SyncSmartShelf = {
		shelfId: "s1",
		name: "Classics",
		conditions: '{"v":1,"root":{"op":"and","items":[]}}',
		pinned: true,
		sortOrder: 1,
		deleted: false,
		createdAt: 1_000,
		updatedAt: 1_000,
	};

	test("a newer rename wins, an older push does not undo it", async () => {
		expect((await push({ smartShelves: [shelf] })).ok).toBe(true);
		expect(
			(await push({ smartShelves: [{ ...shelf, name: "Renamed", updatedAt: 2_000 }] })).ok,
		).toBe(true);
		expect((await push({ smartShelves: [shelf] })).ok).toBe(true);
		const data = await pull();
		expect(data.smartShelves).toEqual([{ ...shelf, name: "Renamed", updatedAt: 2_000 }]);
	});

	test("a delete travels as a tombstone; a push without shelves changes nothing", async () => {
		await push({ smartShelves: [{ ...shelf, deleted: true, updatedAt: 3_000 }] });
		expect((await push({})).ok).toBe(true);
		const data = await pull();
		expect(data.smartShelves).toHaveLength(1);
		expect(data.smartShelves?.[0]?.deleted).toBe(true);
	});
});
