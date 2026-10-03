import type { SyncPayload } from "@lesefluss/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const preferenceStore = new Map<string, string>();

vi.mock("@capacitor/preferences", () => ({
	Preferences: {
		get: vi.fn(async ({ key }: { key: string }) => ({ value: preferenceStore.get(key) ?? null })),
		set: vi.fn(async ({ key, value }: { key: string; value: string }) => {
			preferenceStore.set(key, value);
		}),
		remove: vi.fn(async ({ key }: { key: string }) => {
			preferenceStore.delete(key);
		}),
	},
}));

vi.mock("../auth-client", () => ({ SYNC_URL: "https://lesefluss.app", syncAuthClient: null }));

vi.mock("../session", async (importOriginal) => ({
	...(await importOriginal<typeof import("../session")>()),
	isSyncReady: vi.fn(async () => true),
}));

vi.mock("../../db/queries", () => ({
	queries: {
		getBooksForSync: vi.fn(async () => []),
		getSettings: vi.fn(async () => ({
			readerFontSize: 16,
			syncHighlights: true,
			syncGlossary: true,
			syncStats: true,
			updatedAt: Date.now(),
		})),
		getAllHighlights: vi.fn(async () => []),
		getAllEntries: vi.fn(async () => []),
		getSeriesForSync: vi.fn(async () => []),
		getReadingSessionsSince: vi.fn(async () => []),
	},
}));

const pushed: SyncPayload[] = [];
vi.mock("../../authed-fetch", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../authed-fetch")>()),
	authedFetch: vi.fn(async (_path: string, options?: { body?: string }) => {
		if (options?.body) pushed.push(JSON.parse(options.body));
		return new Response(null, { status: 204 });
	}),
}));

import { pushSync } from "../index";
import {
	clearAccountScopedState,
	hasAdoptedServerSettings,
	LAST_SYNCED_KEY,
	markServerSettingsAdopted,
} from "../session";

beforeEach(() => {
	preferenceStore.clear();
	pushed.length = 0;
});

describe("settings push before adoption", () => {
	it("withholds fresh-install settings until the account's have been pulled", async () => {
		await pushSync(new Set());
		expect(pushed[0]?.settings).toBeNull();
	});

	it("sends settings once adopted", async () => {
		await markServerSettingsAdopted();
		await pushSync(new Set());
		expect(pushed[0]?.settings?.readerFontSize).toBe(16);
	});
});

describe("hasAdoptedServerSettings", () => {
	it("counts an install that synced before the marker existed as adopted", async () => {
		preferenceStore.set(LAST_SYNCED_KEY, "123");
		expect(await hasAdoptedServerSettings()).toBe(true);
	});

	it("starts over after an account change", async () => {
		await markServerSettingsAdopted();
		preferenceStore.set(LAST_SYNCED_KEY, "123");
		await clearAccountScopedState();
		expect(await hasAdoptedServerSettings()).toBe(false);
	});
});
