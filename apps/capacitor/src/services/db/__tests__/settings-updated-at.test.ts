// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "./test-db";

const { db, close } = createTestDb();
vi.mock("../index", () => ({
	get db() {
		return db;
	},
}));
afterAll(close);

const { getSettings, saveSettings } = await import("../queries/settings");

describe("saveSettings updatedAt", () => {
	beforeEach(async () => {
		await getSettings();
	});

	it("leaves updatedAt alone for local-only fields", async () => {
		await saveSettings({ readerFontSize: 20 }, 1000);

		await saveSettings({
			onboardingCompleted: true,
			appFontSize: 18,
			syncStats: false,
			einkMode: true,
		});

		const s = await getSettings();
		expect(s.updatedAt).toBe(1000);
		expect(s.onboardingCompleted).toBe(true);
		expect(s.einkMode).toBe(true);
	});

	it("bumps updatedAt when a synced field changes", async () => {
		await saveSettings({ readerFontSize: 20 }, 1000);
		const before = Date.now();
		await saveSettings({ readerFontSize: 22 });
		expect((await getSettings()).updatedAt).toBeGreaterThanOrEqual(before);
	});

	it("stores an explicit updatedAt as given", async () => {
		await saveSettings({ readerFontSize: 24 }, 42);
		expect((await getSettings()).updatedAt).toBe(42);
	});
});
