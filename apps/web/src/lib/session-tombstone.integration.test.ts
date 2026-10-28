// @vitest-environment node
//
// Reading-session deletions through the sync endpoints against a real Postgres
// database. Skipped when DATABASE_URL is unset.
import { randomUUID } from "node:crypto";
import type { SyncPayload, SyncReadingSession, SyncResponse } from "@lesefluss/core";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { db } from "~/db";
import { user } from "~/db/auth-schema";
import { syncReadingGoals, syncReadingSessions } from "~/db/schema";
import { Route as SyncRoute } from "~/routes/api/sync";
import { Route as DeleteSessionRoute } from "~/routes/api/sync/delete-session";
import { Route as WipeSessionsRoute } from "~/routes/api/sync/wipe-sessions";

vi.mock("~/lib/mailer", () => ({ sendMail: vi.fn(async () => {}) }));
// The handlers are called directly with a user; auth would need OAuth env to even load.
vi.mock("~/lib/session-middleware", () => ({ requireAuth: {} }));

const hasDb = Boolean(process.env.DATABASE_URL);

type Handler = (ctx: { request: Request; context: { user: { id: string } } }) => Promise<Response>;
const handlersOf = (route: { options: { server?: unknown } }) =>
	(route.options.server as { handlers: Record<string, Handler> }).handlers;
const syncHandlers = handlersOf(SyncRoute);
const deleteHandlers = handlersOf(DeleteSessionRoute);
const wipeHandlers = handlersOf(WipeSessionsRoute);

describe.skipIf(!hasDb)("reading session tombstones (integration)", () => {
	const userId = `test-tombstone-${randomUUID().slice(0, 8)}`;
	const context = { user: { id: userId } };

	beforeAll(async () => {
		await db.insert(user).values({ id: userId, name: "Reader", email: `${userId}@example.test` });
	});

	beforeEach(async () => {
		await db.delete(syncReadingSessions).where(eq(syncReadingSessions.userId, userId));
	});

	afterAll(async () => {
		await db.delete(syncReadingGoals).where(eq(syncReadingGoals.userId, userId));
		await db.delete(syncReadingSessions).where(eq(syncReadingSessions.userId, userId));
		await db.delete(user).where(eq(user.id, userId));
	});

	function session(sessionId: string, updatedAt = 2_000): SyncReadingSession {
		return {
			sessionId,
			bookId: "f0f0f0f0",
			mode: "scroll",
			startedAt: 1_000,
			endedAt: 61_000,
			durationMs: 60_000,
			wordsRead: 120,
			startWord: 0,
			endWord: 95,
			furthestWord: 95,
			wpmAvg: 120,
			updatedAt,
		};
	}

	async function push(readingSessions: SyncReadingSession[]) {
		const payload: SyncPayload = {
			books: [],
			settings: null,
			highlights: [],
			glossaryEntries: [],
			series: [],
			readingSessions,
		};
		const res = await syncHandlers.POST({
			request: new Request("https://lesefluss.test/api/sync", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			}),
			context,
		});
		expect(res.ok).toBe(true);
	}

	async function get(query: string): Promise<SyncResponse> {
		const res = await syncHandlers.GET({
			request: new Request(`https://lesefluss.test/api/sync${query}`),
			context,
		});
		return (await res.json()) as SyncResponse;
	}

	async function pull(since = 0): Promise<{ live: string[]; deleted: string[] }> {
		const data = await get(`?sessionTombstonesSince=${since}`);
		return {
			live: data.readingSessions.map((s) => s.sessionId).sort(),
			deleted: [...(data.deletedSessionIds ?? [])].sort(),
		};
	}

	async function deleteOne(sessionId: string) {
		const res = await deleteHandlers.POST({
			request: new Request("https://lesefluss.test/api/sync/delete-session", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ sessionId }),
			}),
			context,
		});
		expect(res.ok).toBe(true);
	}

	async function wipe() {
		const res = await wipeHandlers.POST({
			request: new Request("https://lesefluss.test/api/sync/wipe-sessions", { method: "POST" }),
			context,
		});
		expect(res.ok).toBe(true);
	}

	async function storedRow(sessionId: string) {
		const [row] = await db
			.select()
			.from(syncReadingSessions)
			.where(
				and(eq(syncReadingSessions.userId, userId), eq(syncReadingSessions.sessionId, sessionId)),
			);
		return row;
	}

	test("a single delete tombstones the row and pulls list it as an id only", async () => {
		await push([session("a"), session("b")]);
		await deleteOne("a");
		expect(await pull()).toEqual({ live: ["b"], deleted: ["a"] });
		expect((await storedRow("a"))?.deleted).toBe(true);
	});

	test("a later push from a device still holding the row does not revive it, in either payload shape", async () => {
		await push([session("a")]);
		await deleteOne("a");
		const tombstonedAt = (await storedRow("a"))?.updatedAt;
		const { furthestWord: _, ...legacy } = session("a", Date.now() + 120_000);
		await push([session("a", Date.now() + 60_000), legacy as SyncReadingSession]);
		expect(await pull()).toEqual({ live: [], deleted: ["a"] });
		expect((await storedRow("a"))?.updatedAt).toEqual(tombstonedAt);
	});

	test("the stats wipe tombstones every row; sessions recorded afterwards stay live", async () => {
		await push([session("a"), session("b"), session("c")]);
		await deleteOne("a");
		await wipe();
		expect(await pull()).toEqual({ live: [], deleted: ["a", "b", "c"] });
		await push([session("a", Date.now() + 60_000), session("fresh")]);
		expect(await pull()).toEqual({ live: ["fresh"], deleted: ["a", "b", "c"] });
	});

	test("the stats wipe tombstones goals, so pulls hand other devices the deletion", async () => {
		const then = new Date(Date.now() - 60_000);
		await db.insert(syncReadingGoals).values({
			userId,
			goalId: "g1",
			bookId: "f0f0f0f0",
			mode: "deadline",
			status: "active",
			startedAt: then,
			startWord: 0,
			planStartDate: "2026-10-01",
			planStartWord: 0,
			targetDate: "2026-11-01",
			dailyPercent: 5,
			carriedDaysMet: 0,
			createdAt: then,
			updatedAt: then,
		});
		await wipe();
		const goals = (await get("?sessionTombstonesSince=0")).readingGoals ?? [];
		expect(goals.map((g) => [g.goalId, g.deleted])).toEqual([["g1", true]]);
		expect(goals[0]?.updatedAt).toBeGreaterThan(then.getTime());
	});

	test("refuses an id longer than the push schema allows", async () => {
		const res = await deleteHandlers.POST({
			request: new Request("https://lesefluss.test/api/sync/delete-session", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ sessionId: "x".repeat(65) }),
			}),
			context,
		});
		expect(res.status).toBe(400);
	});

	test("a delete that arrives before the row leaves a tombstone the push cannot get past", async () => {
		await deleteOne("early");
		await push([session("early")]);
		expect(await pull()).toEqual({ live: [], deleted: ["early"] });
	});

	test("deleting twice keeps the first tombstone's time", async () => {
		await push([session("a")]);
		await deleteOne("a");
		const first = (await storedRow("a"))?.updatedAt;
		await deleteOne("a");
		expect((await storedRow("a"))?.updatedAt).toEqual(first);
	});

	test("lists only tombstones newer than the client's watermark, and none without one", async () => {
		await push([session("old"), session("new")]);
		await deleteOne("old");
		const first = await get("?sessionTombstonesSince=0");
		expect(first.deletedSessionIds).toEqual(["old"]);
		const asOf = first.deletedSessionIdsAsOf ?? 0;
		// Back-date the first tombstone past the skew margin, as if it were old.
		await db
			.update(syncReadingSessions)
			.set({ updatedAt: new Date(asOf - 60 * 60_000) })
			.where(and(eq(syncReadingSessions.userId, userId), eq(syncReadingSessions.sessionId, "old")));
		await deleteOne("new");
		expect(await pull(asOf)).toEqual({ live: [], deleted: ["new"] });

		const legacy = await get("");
		expect(legacy.deletedSessionIds).toBeUndefined();
		expect(legacy.deletedSessionIdsAsOf).toBeUndefined();
	});
});
