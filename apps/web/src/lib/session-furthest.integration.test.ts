// @vitest-environment node
//
// Reading sessions' furthest word through /api/sync against a real Postgres database.
// Skipped when DATABASE_URL is unset.
import { randomUUID } from "node:crypto";
import type { SyncPayload, SyncReadingSession } from "@lesefluss/core";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { db } from "~/db";
import { user } from "~/db/auth-schema";
import { syncReadingSessions } from "~/db/schema";
import { Route as SyncRoute } from "~/routes/api/sync";

vi.mock("~/lib/mailer", () => ({ sendMail: vi.fn(async () => {}) }));
// The handlers are called directly with a user; auth would need OAuth env to even load.
vi.mock("~/lib/session-middleware", () => ({ requireAuth: {} }));

const hasDb = Boolean(process.env.DATABASE_URL);

type Handler = (ctx: { request: Request; context: { user: { id: string } } }) => Promise<Response>;
const syncHandlers = (SyncRoute.options.server as unknown as { handlers: Record<string, Handler> })
	.handlers;

describe.skipIf(!hasDb)("reading session furthest word (integration)", () => {
	const userId = `test-furthest-${randomUUID().slice(0, 8)}`;
	const sessionId = `s-${randomUUID().slice(0, 8)}`;

	beforeAll(async () => {
		await db.insert(user).values({ id: userId, name: "Reader", email: `${userId}@example.test` });
	});

	afterAll(async () => {
		await db.delete(syncReadingSessions).where(inArray(syncReadingSessions.userId, [userId]));
		await db.delete(user).where(eq(user.id, userId));
	});

	function session(updatedAt: number, fields: Partial<SyncReadingSession> = {}) {
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
			wpmAvg: 120,
			updatedAt,
			...fields,
		} satisfies SyncReadingSession;
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
			context: { user: { id: userId } },
		});
		expect(res.ok).toBe(true);
	}

	async function stored() {
		const [row] = await db
			.select({ furthestWord: syncReadingSessions.furthestWord })
			.from(syncReadingSessions)
			.where(
				and(eq(syncReadingSessions.userId, userId), eq(syncReadingSessions.sessionId, sessionId)),
			);
		return row?.furthestWord;
	}

	async function pulled() {
		const res = await syncHandlers.GET({
			request: new Request("https://lesefluss.test/api/sync"),
			context: { user: { id: userId } },
		});
		const data = (await res.json()) as { readingSessions: SyncReadingSession[] };
		return data.readingSessions.find((s) => s.sessionId === sessionId)?.furthestWord;
	}

	test("stores and returns it, last write wins", async () => {
		await push([session(2_000, { furthestWord: 120 })]);
		expect(await stored()).toBe(120);
		expect(await pulled()).toBe(120);
		await push([session(3_000, { furthestWord: 90 })]);
		expect(await stored()).toBe(90);
		await push([session(2_500, { furthestWord: 400 })]);
		expect(await stored()).toBe(90);
	});

	test("a client from before the field keeps the stored value", async () => {
		await push([session(4_000)]);
		expect(await stored()).toBe(90);
		await push([session(5_000, { furthestWord: null })]);
		expect(await stored()).toBe(90);
	});
});
