// @vitest-environment node
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { settings } from "../schema";
import { createTestDb } from "./test-db";

const { db, close } = createTestDb();
vi.mock("../index", () => ({
	get db() {
		return db;
	},
}));
afterAll(close);

const { getSettings } = await import("../queries/settings");

function systemPrefersDark(isDark: boolean) {
	vi.stubGlobal("matchMedia", (query: string) => ({
		matches: query === "(prefers-color-scheme: dark)" && isDark,
	}));
}

describe("first launch theme", () => {
	afterEach(async () => {
		vi.unstubAllGlobals();
		await db.delete(settings);
	});

	it("follows a dark system scheme", async () => {
		systemPrefersDark(true);
		expect((await getSettings()).readerTheme).toBe("dark");
	});

	it("follows a light system scheme", async () => {
		systemPrefersDark(false);
		expect((await getSettings()).readerTheme).toBe("light");
	});

	it("keeps the stored theme once the row exists, whatever the system says", async () => {
		systemPrefersDark(false);
		await getSettings();
		systemPrefersDark(true);
		expect((await getSettings()).readerTheme).toBe("light");
	});
});
