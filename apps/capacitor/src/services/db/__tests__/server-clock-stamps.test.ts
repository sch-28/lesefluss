// @vitest-environment node
import { type SyncBook, wordPos } from "@lesefluss/core";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "./test-db";

const { db, raw, close } = createTestDb();
vi.mock("../index", () => ({
	get db() {
		return db;
	},
}));
vi.mock("@capacitor/preferences", () => ({
	Preferences: { get: async () => ({ value: null }), set: async () => {} },
}));
vi.mock("../../sync", () => ({ scheduleSyncPush: () => {} }));
afterAll(close);

const {
	adoptBookStamps,
	applyBookMerge,
	deleteBook,
	getBooksForSync,
	updateBook,
	writeReaderPosition,
} = await import("../queries/books");
const { commitChapter } = await import("../../serial-scrapers/commit");
const { getSettings, saveSettings } = await import("../queries/settings");
const { buildBookMergeUpdate } = await import("../../sync/book-merge");
const { recordServerTime, _resetForTests } = await import("../../sync/server-clock");

const MINUTE = 60_000;
/** Real (server) time 10:00. */
const TEN = Date.UTC(2026, 10, 6, 10);
const HOUR_AHEAD = 60 * MINUTE;
const SERVER_STAMP = TEN - 24 * 60 * MINUTE;

function deviceClock(realMs: number, ahead: number): void {
	vi.setSystemTime(realMs + ahead);
}

/** A pull at real `realMs` from a device whose clock runs `ahead`, 200ms round trip. */
function pullAt(realMs: number, ahead: number): void {
	deviceClock(realMs, ahead);
	recordServerTime({
		serverTime: realMs,
		sentAt: realMs + ahead - 100,
		receivedAt: realMs + ahead + 100,
	});
}

type Row = { word_position: number; updated_at: number; metadata_updated_at: number };
function row(): Row {
	return raw
		.prepare("SELECT word_position, updated_at, metadata_updated_at FROM books WHERE id = 'b1'")
		.get() as Row;
}

async function readOffline(word: number): Promise<number> {
	const { stamp } = await writeReaderPosition("b1", {
		wordPosition: wordPos(word),
		lastRead: Date.now(),
		baseRev: row().updated_at,
	});
	return stamp;
}

function tablet(overrides: Partial<SyncBook>): SyncBook {
	return {
		bookId: "b1",
		title: "Book",
		author: null,
		fileSize: 1,
		wordCount: 1000,
		wordPosition: 100,
		chapterStatus: "fetched",
		deleted: false,
		updatedAt: SERVER_STAMP,
		metadataUpdatedAt: SERVER_STAMP,
		addedAt: 500,
		...overrides,
	};
}

async function pullBook(server: SyncBook): Promise<void> {
	const local = (await getBooksForSync()).find((b) => b.id === "b1");
	if (!local) throw new Error("no local row");
	const update = buildBookMergeUpdate(local, server);
	if (update) await applyBookMerge("b1", update, server.updatedAt);
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date", "performance"] });
	_resetForTests();
	raw.exec("DELETE FROM books");
	raw
		.prepare(
			`INSERT INTO books (id, title, file_format, size, word_position, word_count, is_active, added_at, deleted, updated_at, metadata_updated_at, last_read)
			 VALUES ('b1', 'Book', 'epub', 1, 100, 1000, 0, 500, 0, ${SERVER_STAMP}, ${SERVER_STAMP}, ${SERVER_STAMP})`,
		)
		.run();
});

afterEach(() => {
	vi.useRealTimers();
});

describe("a fast clock that has synced once", () => {
	beforeEach(() => pullAt(TEN - 10 * MINUTE, HOUR_AHEAD));

	it("stamps an offline position with server time, so a newer one from another device lands", async () => {
		deviceClock(TEN, HOUR_AHEAD);
		expect(await readOffline(300)).toBe(TEN);

		await pullBook(tablet({ wordPosition: 500, updatedAt: TEN + 20 * MINUTE }));

		expect(row()).toMatchObject({ word_position: 500, updated_at: TEN + 20 * MINUTE });
	});

	it("stamps offline metadata and settings with server time", async () => {
		deviceClock(TEN, HOUR_AHEAD);
		await updateBook("b1", { rating: 4 });
		await getSettings();
		await saveSettings({ readerFontSize: 20 });

		expect(row().metadata_updated_at).toBe(TEN);
		expect((await getSettings()).updatedAt).toBe(TEN);
	});

	it("stamps an offline delete and a fetched chapter with server time", async () => {
		deviceClock(TEN, HOUR_AHEAD);
		await commitChapter("b1", { status: "locked" });
		expect(row().updated_at).toBe(TEN);

		await deleteBook("b1");
		expect(row().updated_at).toBe(TEN);
	});

	it("keeps its own saves in order", async () => {
		deviceClock(TEN, HOUR_AHEAD);
		const first = await readOffline(300);
		const second = await readOffline(310);
		expect(second).toBeGreaterThan(first);
		expect(row()).toMatchObject({ word_position: 310, updated_at: second });
	});
});

describe("a slow clock that has synced once", () => {
	beforeEach(() => pullAt(TEN - 10 * MINUTE, -HOUR_AHEAD));

	it("stamps an offline position, metadata and settings with server time", async () => {
		deviceClock(TEN, -HOUR_AHEAD);
		expect(await readOffline(300)).toBe(TEN);
		await updateBook("b1", { rating: 4 });
		await getSettings();
		await saveSettings({ readerFontSize: 20 });

		expect(row().metadata_updated_at).toBe(TEN);
		expect((await getSettings()).updatedAt).toBe(TEN);
	});
});

describe("a fast clock with no offset yet", () => {
	it("stamps with its own clock, and the push's clamped stamp is still adopted", async () => {
		deviceClock(TEN, HOUR_AHEAD);
		const stamp = await readOffline(300);
		expect(stamp).toBe(TEN + HOUR_AHEAD);

		await adoptBookStamps(
			"b1",
			{ updatedAt: stamp, metadataUpdatedAt: SERVER_STAMP },
			{ updatedAt: TEN + 40 * MINUTE, metadataUpdatedAt: SERVER_STAMP },
		);

		expect(row()).toMatchObject({ word_position: 300, updated_at: TEN + 40 * MINUTE });
	});
});

describe("a correct clock", () => {
	beforeEach(() => pullAt(TEN - 10 * MINUTE, 300));

	it("stamps exactly as before", async () => {
		deviceClock(TEN, 300);
		const now = Date.now();
		expect(await readOffline(300)).toBe(now);
		await getSettings();
		await saveSettings({ readerFontSize: 20 });
		expect((await getSettings()).updatedAt).toBe(now);
	});

	it("still lets the newer of two positions win", async () => {
		deviceClock(TEN, 300);
		await readOffline(300);
		await pullBook(tablet({ wordPosition: 500, updatedAt: TEN - MINUTE }));
		expect(row().word_position).toBe(300);
		await pullBook(tablet({ wordPosition: 500, updatedAt: TEN + MINUTE }));
		expect(row().word_position).toBe(500);
	});
});
