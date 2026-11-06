// @vitest-environment node
//
// What a push answers about the stamps it clamped, through the sync route,
// against a real Postgres database. Skipped when DATABASE_URL is unset; point it
// at a throwaway database.
import { randomUUID } from "node:crypto";
import type { SyncBook, SyncPayload, SyncPushStamps, SyncSettings } from "@lesefluss/core";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { db } from "~/db";
import { user } from "~/db/auth-schema";
import { syncBooks, syncSettings } from "~/db/schema";
import { Route as SyncRoute } from "~/routes/api/sync";

vi.mock("~/lib/mailer", () => ({ sendMail: vi.fn(async () => {}) }));
// The handlers are called directly with a user; auth would need OAuth env to even load.
vi.mock("~/lib/session-middleware", () => ({ requireAuth: {} }));

const hasDb = Boolean(process.env.DATABASE_URL);

type Handler = (ctx: { request: Request; context: { user: { id: string } } }) => Promise<Response>;
const syncHandlers = (SyncRoute.options.server as unknown as { handlers: Record<string, Handler> })
	.handlers;

const SERVER_NOW = Date.UTC(2026, 10, 6, 12);
const AHEAD = 60 * 60_000;

describe.skipIf(!hasDb)("sync push stamps (integration)", () => {
	const userId = `test-push-stamps-${randomUUID().slice(0, 8)}`;
	const bookId = "5eed0001";

	beforeAll(async () => {
		await db.insert(user).values({ id: userId, name: "Stamps", email: `${userId}@example.test` });
	});

	beforeEach(() => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(SERVER_NOW);
		vi.stubEnv("ORIGIN_KEY_SECRET", "test");
	});

	afterEach(async () => {
		vi.useRealTimers();
		vi.unstubAllEnvs();
		await db.delete(syncBooks).where(eq(syncBooks.userId, userId));
		await db.delete(syncSettings).where(eq(syncSettings.userId, userId));
	});

	afterAll(async () => {
		await db.delete(user).where(eq(user.id, userId));
	});

	function book(wordPosition: number, stamp: number): SyncBook {
		return {
			bookId,
			title: "Book",
			author: null,
			fileSize: 0,
			wordCount: 1000,
			wordPosition,
			chapterStatus: "fetched",
			deleted: false,
			updatedAt: stamp,
			metadataUpdatedAt: stamp,
		};
	}

	function settings(wpm: number, stamp: number): SyncSettings {
		return {
			wpm,
			delayComma: 2,
			delayPeriod: 3,
			accelStart: 2,
			accelRate: 0.1,
			xOffset: 30,
			focalLetterColor: "#ff0000",
			wordOffset: 5,
			readerTheme: "sepia",
			readerFontSize: 18,
			readerFontFamily: "serif",
			readerBold: true,
			readerTextAlign: "justify",
			readerRuler: true,
			readerRulerLines: 2,
			readerLineSpacing: 1.8,
			readerMargin: 20,
			readerLetterSpacing: 0.04,
			readerWordSpacing: 0.16,
			readerParagraphSpacing: 1.6,
			showReadingTime: true,
			readerActiveWordUnderline: false,
			readerGlossaryUnderline: true,
			defaultReaderMode: "scroll",
			paginationStyle: "page",
			updatedAt: stamp,
		};
	}

	function push(books: SyncBook[], pushedSettings: SyncSettings | null = null) {
		const payload: SyncPayload = {
			books,
			settings: pushedSettings,
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

	async function stored() {
		const [b] = await db
			.select()
			.from(syncBooks)
			.where(and(eq(syncBooks.userId, userId), eq(syncBooks.bookId, bookId)));
		const [s] = await db.select().from(syncSettings).where(eq(syncSettings.userId, userId));
		return { wordPosition: b?.wordPosition, wpm: s?.wpm };
	}

	test("a clock running ahead gets the clamped stamps back, and once it adopts them it cannot override a newer write from another device", async () => {
		const fast = SERVER_NOW + AHEAD;
		const res = await push([book(100, fast)], settings(400, fast));
		expect(res.status).toBe(200);
		const stamps = (await res.json()) as SyncPushStamps;
		expect(stamps).toEqual({
			books: [{ bookId, updatedAt: SERVER_NOW, metadataUpdatedAt: SERVER_NOW }],
			settingsUpdatedAt: SERVER_NOW,
		});

		vi.setSystemTime(SERVER_NOW + 60_000);
		const other = await push([book(500, SERVER_NOW + 60_000)], settings(500, SERVER_NOW + 60_000));
		expect(other.status).toBe(204);

		vi.setSystemTime(SERVER_NOW + 120_000);
		const adopted = stamps.books[0]?.updatedAt ?? 0;
		const again = await push([book(100, adopted)], settings(400, stamps.settingsUpdatedAt ?? 0));
		expect(again.status).toBe(204);
		expect(await stored()).toEqual({ wordPosition: 500, wpm: 500 });
	});

	test("a clock running ahead that keeps its own stamps overrides the newer write: why the stamps go back", async () => {
		const fast = SERVER_NOW + AHEAD;
		await push([book(100, fast)], settings(400, fast));
		vi.setSystemTime(SERVER_NOW + 60_000);
		await push([book(500, SERVER_NOW + 60_000)], settings(500, SERVER_NOW + 60_000));
		vi.setSystemTime(SERVER_NOW + 120_000);
		await push([book(100, fast)], settings(400, fast));
		expect(await stored()).toEqual({ wordPosition: 100, wpm: 400 });
	});

	test("correct clocks: no stamps come back and the newer write wins", async () => {
		const first = await push([book(100, SERVER_NOW - 2000)], settings(400, SERVER_NOW - 2000));
		expect(first.status).toBe(204);
		const newer = await push([book(500, SERVER_NOW - 1000)], settings(500, SERVER_NOW - 1000));
		expect(newer.status).toBe(204);
		const stale = await push([book(100, SERVER_NOW - 2000)], settings(400, SERVER_NOW - 2000));
		expect(stale.status).toBe(204);
		expect(await stored()).toEqual({ wordPosition: 500, wpm: 500 });
	});

	test("only the clamped books are listed", async () => {
		const other = { ...book(50, SERVER_NOW - 1000), bookId: "5eed0002" };
		const res = await push([book(100, SERVER_NOW + AHEAD), other]);
		const stamps = (await res.json()) as SyncPushStamps;
		expect(stamps.books.map((b) => b.bookId)).toEqual([bookId]);
		expect(stamps.settingsUpdatedAt).toBeNull();
	});
});
