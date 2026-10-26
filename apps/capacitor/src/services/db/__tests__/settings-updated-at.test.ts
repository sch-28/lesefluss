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
			volumeKeyPageTurn: false,
			volumeKeyInvert: true,
			ttsWpm: 220,
			ttsVoices: '{"de":"de-de-x-deb-local"}',
		});

		const s = await getSettings();
		expect(s.updatedAt).toBe(1000);
		expect(s.onboardingCompleted).toBe(true);
		expect(s.einkMode).toBe(true);
		expect(s.volumeKeyPageTurn).toBe(false);
		expect(s.volumeKeyInvert).toBe(true);
		expect(s.ttsWpm).toBe(220);
		expect(s.ttsVoices).toBe('{"de":"de-de-x-deb-local"}');
	});

	it("bumps updatedAt when a synced field changes", async () => {
		await saveSettings({ readerFontSize: 20 }, 1000);
		const before = Date.now();
		await saveSettings({ readerFontSize: 22 });
		expect((await getSettings()).updatedAt).toBeGreaterThanOrEqual(before);
	});

	it("adopting a server row from before text spacing and bold keeps them as set here", async () => {
		await saveSettings(
			{ readerLetterSpacing: 0.04, readerParagraphSpacing: 1.6, readerBold: true },
			1000,
		);

		// What `pick(serverRow, SYNCED_SETTING_KEYS)` yields for columns the server lacks.
		await saveSettings(
			{
				readerFontSize: 20,
				readerLetterSpacing: undefined,
				readerParagraphSpacing: undefined,
				readerBold: undefined,
			},
			2000,
		);

		expect(await getSettings()).toMatchObject({
			readerFontSize: 20,
			readerLetterSpacing: 0.04,
			readerParagraphSpacing: 1.6,
			readerBold: true,
		});
	});

	it("stores an explicit updatedAt as given", async () => {
		await saveSettings({ readerFontSize: 24 }, 42);
		expect((await getSettings()).updatedAt).toBe(42);
	});
});
