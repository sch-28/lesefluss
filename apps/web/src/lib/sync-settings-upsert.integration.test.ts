// @vitest-environment node
//
// Settings upsert against a real Postgres database. Skipped when DATABASE_URL
// is unset so it never breaks `pnpm test`.
import { randomUUID } from "node:crypto";
import { SyncPushSchema, type SyncSettings, type SyncSettingsPush } from "@lesefluss/core";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, test } from "vitest";
import { db } from "~/db";
import { syncSettings } from "~/db/schema";
import { upsertSyncSettings } from "./sync-settings-upsert";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("sync_settings upsert (integration)", () => {
	const userId = `test-settings-upsert-${randomUUID()}`;

	afterEach(async () => {
		await db.delete(syncSettings).where(eq(syncSettings.userId, userId));
	});

	const full = {
		wpm: 400,
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
		updatedAt: 1_000_000,
	} satisfies SyncSettings;

	/** Settings as the route hands them over: through the server's push parse. */
	function parsed(settings: Record<string, unknown>): SyncSettingsPush {
		const result = SyncPushSchema.parse({ books: [], settings, highlights: [] });
		if (!result.settings) throw new Error("settings missing");
		return result.settings;
	}

	async function read() {
		const [row] = await db.select().from(syncSettings).where(eq(syncSettings.userId, userId));
		return row;
	}

	test("a push with an unknown enum value keeps the stored value and applies the rest", async () => {
		await upsertSyncSettings(db, userId, parsed(full));
		await upsertSyncSettings(
			db,
			userId,
			parsed({ ...full, readerFontFamily: "comic-neue", wpm: 500, updatedAt: 2_000_000 }),
		);
		expect(await read()).toMatchObject({ readerFontFamily: "serif", wpm: 500 });
	});

	test("a push that omits a field leaves its stored value unchanged", async () => {
		await upsertSyncSettings(db, userId, parsed(full));
		const { readerActiveWordUnderline: _, ...older } = full;
		await upsertSyncSettings(db, userId, parsed({ ...older, wpm: 450, updatedAt: 2_000_000 }));
		expect(await read()).toMatchObject({ readerActiveWordUnderline: false, wpm: 450 });
	});

	test("a first push without a field stores the column default, so a pull is complete", async () => {
		const { readerGlossaryUnderline: _, ...older } = full;
		await upsertSyncSettings(db, userId, parsed({ ...older, readerTheme: "contrast" }));
		expect(await read()).toMatchObject({ readerGlossaryUnderline: true, readerTheme: "dark" });
	});

	test("a push from a client that predates text spacing keeps the spacing another device set", async () => {
		await upsertSyncSettings(db, userId, parsed(full));
		const {
			readerLetterSpacing: _l,
			readerWordSpacing: _w,
			readerParagraphSpacing: _p,
			...older
		} = full;
		await upsertSyncSettings(
			db,
			userId,
			parsed({ ...older, readerFontSize: 20, updatedAt: 2_000_000 }),
		);
		expect(await read()).toMatchObject({
			readerLetterSpacing: 0.04,
			readerWordSpacing: 0.16,
			readerParagraphSpacing: 1.6,
			readerFontSize: 20,
		});
	});

	test("a first push without text spacing stores today's rendering", async () => {
		const {
			readerLetterSpacing: _l,
			readerWordSpacing: _w,
			readerParagraphSpacing: _p,
			...older
		} = full;
		await upsertSyncSettings(db, userId, parsed(older));
		expect(await read()).toMatchObject({
			readerLetterSpacing: 0,
			readerWordSpacing: 0,
			readerParagraphSpacing: 1.1,
		});
	});

	test("a push from a client that predates bold text keeps the bold another device set", async () => {
		await upsertSyncSettings(db, userId, parsed(full));
		const { readerBold: _, ...older } = full;
		await upsertSyncSettings(db, userId, parsed({ ...older, wpm: 420, updatedAt: 2_000_000 }));
		expect(await read()).toMatchObject({ readerBold: true, wpm: 420 });
	});

	test("a push from a client that predates alignment keeps the justify another device set", async () => {
		await upsertSyncSettings(db, userId, parsed(full));
		const { readerTextAlign: _, ...older } = full;
		await upsertSyncSettings(db, userId, parsed({ ...older, wpm: 420, updatedAt: 2_000_000 }));
		expect(await read()).toMatchObject({ readerTextAlign: "justify", wpm: 420 });
	});

	test("an older push is still ignored", async () => {
		await upsertSyncSettings(db, userId, parsed({ ...full, updatedAt: 2_000_000 }));
		await upsertSyncSettings(db, userId, parsed({ ...full, wpm: 200, updatedAt: 1_500_000 }));
		expect((await read())?.wpm).toBe(400);
	});

	test("a pushed high-contrast theme survives the push parse and is stored", async () => {
		const settings = parsed({ ...full, readerTheme: "high-contrast" });
		expect(settings.readerTheme).toBe("high-contrast");
		await upsertSyncSettings(db, userId, settings);
		expect((await read())?.readerTheme).toBe("high-contrast");
	});
});
