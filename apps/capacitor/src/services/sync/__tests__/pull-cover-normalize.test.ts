// @vitest-environment node
import type { SyncResponse } from "@lesefluss/core";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../../db/__tests__/test-db";

const SMALL = "data:image/webp;base64,c21hbGw=";
const { db, raw, close } = createTestDb();

const normalizeCoverDataUrl = vi.hoisted(() => vi.fn(async (_cover: string | null) => SMALL));
vi.mock("@lesefluss/book-import/utils/cover-image", async (importOriginal) => ({
	...(await importOriginal<typeof import("@lesefluss/book-import/utils/cover-image")>()),
	normalizeCoverDataUrl,
}));
vi.mock("../../db/index", () => ({
	get db() {
		return db;
	},
}));
afterAll(close);

vi.mock("@capacitor/preferences", () => {
	const store = new Map<string, string>();
	return {
		Preferences: {
			get: async ({ key }: { key: string }) => ({ value: store.get(key) ?? null }),
			set: async ({ key, value }: { key: string; value: string }) => {
				store.set(key, value);
			},
			remove: async ({ key }: { key: string }) => {
				store.delete(key);
			},
		},
	};
});
// The e2e hook writes to `window`, which this node environment lacks.
vi.mock("../../../test-hooks/sync", () => ({ exposeRemoteSettingsApply: () => {} }));
vi.mock("../auth-client", () => ({ SYNC_URL: "https://lesefluss.app", syncAuthClient: null }));
vi.mock("../session", async (importOriginal) => ({
	...(await importOriginal<typeof import("../session")>()),
	isSyncReady: vi.fn(async () => true),
}));

let pullResponse: SyncResponse;
vi.mock("../../authed-fetch", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../authed-fetch")>()),
	authedFetch: vi.fn(async () => Response.json(pullResponse)),
}));

const { pullSync } = await import("../index");
const { COVER_BUDGET_CHARS } = await import("../../covers/shrink-legacy-covers");

const BIG = `data:image/jpeg;base64,${"A".repeat(COVER_BUDGET_CHARS * 5)}`;

function response(overrides: Partial<SyncResponse>): SyncResponse {
	return {
		books: [],
		settings: null,
		highlights: [],
		glossaryEntries: [],
		series: [],
		readingSessions: [],
		...overrides,
	};
}

function serverSeries(updatedAt: number) {
	return {
		seriesId: "5e5e5e5e",
		title: "Serial",
		author: null,
		coverImage: BIG,
		description: null,
		sourceUrl: "https://example.com/s",
		tocUrl: "https://example.com/s/toc",
		provider: "rss" as const,
		lastCheckedAt: null,
		createdAt: 100,
		deleted: false,
		updatedAt,
	};
}

function stored(sql: string) {
	return (raw.prepare(sql).get() as { cover_image: string | null } | undefined)?.cover_image;
}

beforeEach(() => {
	raw.exec("DELETE FROM book_content; DELETE FROM books; DELETE FROM series;");
	normalizeCoverDataUrl.mockClear();
});

describe("covers pulled from the server", () => {
	it("stores a new book's oversized cover within the budget", async () => {
		pullResponse = response({
			books: [
				{
					bookId: "deadbeef",
					title: "Pulled",
					author: null,
					fileSize: 4,
					wordCount: 1,
					wordPosition: 0,
					content: "text",
					coverImage: BIG,
					chapterStatus: "fetched",
					deleted: false,
					updatedAt: 1_000,
				},
			],
		});
		await pullSync();
		expect(stored("SELECT cover_image FROM book_content WHERE book_id = 'deadbeef'")).toBe(SMALL);
		expect(normalizeCoverDataUrl).toHaveBeenCalledWith(BIG);
	});

	it("stores a new or updated series' oversized cover within the budget", async () => {
		pullResponse = response({ series: [serverSeries(1_000)] });
		await pullSync();
		expect(stored("SELECT cover_image FROM series WHERE id = '5e5e5e5e'")).toBe(SMALL);

		raw.exec(`UPDATE series SET cover_image = 'data:image/webp;base64,b2xk' WHERE id = '5e5e5e5e'`);
		pullResponse = response({ series: [serverSeries(2_000)] });
		await pullSync();
		expect(stored("SELECT cover_image FROM series WHERE id = '5e5e5e5e'")).toBe(SMALL);
		expect(normalizeCoverDataUrl).toHaveBeenCalledTimes(2);
	});

	it("stores a cover within the budget as it came", async () => {
		const small = "data:image/webp;base64,dGlueQ==";
		pullResponse = response({ series: [{ ...serverSeries(1_000), coverImage: small }] });
		await pullSync();
		expect(stored("SELECT cover_image FROM series WHERE id = '5e5e5e5e'")).toBe(small);
		expect(normalizeCoverDataUrl).not.toHaveBeenCalled();
	});
});
