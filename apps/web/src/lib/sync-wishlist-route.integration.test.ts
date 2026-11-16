// @vitest-environment node
//
// The wishlist through the sync route, against a real Postgres database.
// Skipped when DATABASE_URL is unset; point it at a throwaway database.
import { randomUUID } from "node:crypto";
import type { SyncPayload, SyncResponse, SyncWishlistItem } from "@lesefluss/core";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { db } from "~/db";
import { user } from "~/db/auth-schema";
import { syncWishlist } from "~/db/schema";
import { purgeCloudData } from "~/lib/account-deletion";
import { Route as SyncRoute } from "~/routes/api/sync";

vi.mock("~/lib/mailer", () => ({ sendMail: vi.fn(async () => {}) }));
vi.mock("~/lib/session-middleware", () => ({ requireAuth: {} }));
// This file makes more requests per user than the per-minute sync limit allows.
vi.mock("~/lib/rate-limit", () => ({ checkLimit: () => ({ ok: true }) }));

const hasDb = Boolean(process.env.DATABASE_URL);

type Handler = (ctx: { request: Request; context: { user: { id: string } } }) => Promise<Response>;
const syncHandlers = (SyncRoute.options.server as unknown as { handlers: Record<string, Handler> })
	.handlers;

describe.skipIf(!hasDb)("sync route wishlist (integration)", () => {
	const userId = `test-wishlist-${randomUUID().slice(0, 8)}`;
	const otherId = `test-wishlist-other-${randomUUID().slice(0, 8)}`;

	beforeAll(async () => {
		vi.stubEnv("ORIGIN_KEY_SECRET", "test");
		await db.insert(user).values([
			{ id: userId, name: "Wish", email: `${userId}@example.test` },
			{ id: otherId, name: "Other", email: `${otherId}@example.test` },
		]);
	});

	beforeEach(async () => {
		await db.delete(syncWishlist).where(eq(syncWishlist.userId, userId));
		await db.delete(syncWishlist).where(eq(syncWishlist.userId, otherId));
	});

	afterAll(async () => {
		vi.unstubAllEnvs();
		for (const id of [userId, otherId]) {
			await db.delete(syncWishlist).where(eq(syncWishlist.userId, id));
			await db.delete(user).where(eq(user.id, id));
		}
	});

	function post(body: unknown, as = userId) {
		return syncHandlers.POST({
			request: new Request("https://lesefluss.test/api/sync", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			}),
			context: { user: { id: as } },
		});
	}

	async function push(extra: Partial<SyncPayload>, as = userId) {
		const payload: SyncPayload = {
			books: [],
			settings: null,
			highlights: [],
			glossaryEntries: [],
			series: [],
			readingSessions: [],
			...extra,
		};
		const res = await post(payload, as);
		expect(res.ok).toBe(true);
	}

	async function pull(as = userId): Promise<SyncWishlistItem[]> {
		const res = await syncHandlers.GET({
			request: new Request("https://lesefluss.test/api/sync"),
			context: { user: { id: as } },
		});
		const data = (await res.json()) as SyncResponse;
		return [...(data.wishlist ?? [])].sort((a, b) => a.itemId.localeCompare(b.itemId));
	}

	function wish(overrides: Partial<SyncWishlistItem> = {}): SyncWishlistItem {
		return {
			itemId: "w1",
			kind: "catalog",
			ref: "gutenberg:84",
			title: "Frankenstein",
			author: "Mary Shelley",
			coverUrl: null,
			deleted: false,
			createdAt: 1_000,
			updatedAt: 1_000,
			...overrides,
		};
	}

	const serial = wish({
		itemId: "w2",
		kind: "serial",
		ref: "https://www.royalroad.com/fiction/21220/mother-of-learning",
		title: "Mother of Learning",
		coverUrl: "https://covers.test/mol.jpg",
	});

	test("pushed items come back on pull with everything the card shows", async () => {
		await push({ wishlist: [wish(), serial] });
		expect(await pull()).toEqual([wish(), serial]);
	});

	test("a push without a wishlist, as from an older app, leaves it intact", async () => {
		await push({ wishlist: [wish()] });
		await push({});
		expect(await pull()).toEqual([wish()]);
	});

	test("an item missing from a push is not removed", async () => {
		await push({ wishlist: [wish(), serial] });
		await push({ wishlist: [serial] });
		expect((await pull()).map((r) => [r.itemId, r.deleted])).toEqual([
			["w1", false],
			["w2", false],
		]);
	});

	test("a newer edit wins and an older push does not undo it", async () => {
		await push({ wishlist: [wish()] });
		await push({ wishlist: [wish({ title: "Renamed", updatedAt: 2_000 })] });
		await push({ wishlist: [wish()] });
		expect(await pull()).toEqual([wish({ title: "Renamed", updatedAt: 2_000 })]);
	});

	test("a removed item stays removed when a device still holding it pushes it later", async () => {
		await push({ wishlist: [wish()] });
		await push({ wishlist: [wish({ deleted: true, updatedAt: 2_000 })] });
		await push({ wishlist: [wish({ title: "Stale edit", updatedAt: 3_000 })] });
		expect(await pull()).toEqual([wish({ deleted: true, updatedAt: 2_000 })]);
	});

	test("a removal wins over an edit stamped after it", async () => {
		await push({ wishlist: [wish({ title: "Edited", updatedAt: 3_000 })] });
		await push({ wishlist: [wish({ deleted: true, updatedAt: 2_000 })] });
		expect((await pull())[0]).toMatchObject({ deleted: true, updatedAt: 3_000 });
	});

	test("one push carrying the same item twice keeps the removal", async () => {
		await push({
			wishlist: [
				wish({ deleted: true, updatedAt: 1_500 }),
				wish({ title: "Later", updatedAt: 2_000 }),
			],
		});
		expect((await pull())[0]).toMatchObject({ deleted: true });
	});

	test("each account sees only its own wishlist, under the same item id", async () => {
		await push({ wishlist: [wish()] });
		await push({ wishlist: [wish({ title: "Theirs" })] }, otherId);
		expect((await pull()).map((r) => r.title)).toEqual(["Frankenstein"]);
		expect((await pull(otherId)).map((r) => r.title)).toEqual(["Theirs"]);
	});

	test("Clear cloud data removes the wishlist", async () => {
		await push({ wishlist: [wish(), serial] });
		await db.transaction((tx) => purgeCloudData(tx, userId));
		expect(await pull()).toEqual([]);
	});

	test.each([
		["a catalog ref that is a URL", { ref: "https://example.test/book" }],
		["a serial ref that is not a URL", { kind: "serial", ref: "gutenberg:84" }],
		["a script cover URL", { coverUrl: "javascript:alert(1)" }],
		["an unknown kind", { kind: "podcast" }],
		["an overlong title", { title: "x".repeat(501) }],
	])("rejects %s with a 400 and stores nothing", async (_name, bad) => {
		const res = await post({
			books: [],
			settings: null,
			highlights: [],
			wishlist: [{ ...wish(), ...bad }],
		});
		expect(res.status).toBe(400);
		expect(await pull()).toEqual([]);
	});
});
