// @vitest-environment node
import { type SyncBook, wordPos } from "@lesefluss/core";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "./test-db";

const { db, raw, close } = createTestDb();
vi.mock("../index", () => ({
	get db() {
		return db;
	},
}));
afterAll(close);

const { adoptBookStamps, applyBookMerge, getBooksForSync, updateBook } = await import(
	"../queries/books"
);
const { adoptSettingsStamp, getSettings, saveSettings } = await import("../queries/settings");
const { buildBookMergeUpdate } = await import("../../sync/book-merge");

/** This device's clock runs ahead of the server's. */
const FAST = 9000;
const CLAMPED = 2000;

type Row = {
	word_position: number;
	updated_at: number;
	metadata_updated_at: number;
	last_read: number;
	rating: number | null;
};

function row(): Row {
	return raw
		.prepare(
			"SELECT word_position, updated_at, metadata_updated_at, last_read, rating FROM books WHERE id = 'b1'",
		)
		.get() as Row;
}

beforeEach(() => {
	raw.exec("DELETE FROM books");
	raw
		.prepare(
			`INSERT INTO books (id, title, file_format, size, word_position, word_count, is_active, added_at, deleted, updated_at, metadata_updated_at, last_read, rating)
			 VALUES ('b1', 'Book', 'epub', 1, 100, 1000, 0, 500, 0, ${FAST}, ${FAST}, ${FAST}, 3)`,
		)
		.run();
});

function otherDevice(overrides: Partial<SyncBook>): SyncBook {
	return {
		bookId: "b1",
		title: "Book",
		author: null,
		fileSize: 1,
		wordCount: 1000,
		wordPosition: 100,
		chapterStatus: "fetched",
		deleted: false,
		updatedAt: CLAMPED,
		metadataUpdatedAt: CLAMPED,
		addedAt: 500,
		...overrides,
	};
}

async function pull(server: SyncBook) {
	const local = (await getBooksForSync()).find((b) => b.id === "b1");
	if (!local) throw new Error("no local row");
	const update = buildBookMergeUpdate(local, server);
	if (update) await applyBookMerge("b1", update, server.updatedAt);
}

const pushed = { updatedAt: FAST, metadataUpdatedAt: FAST };
const stored = { updatedAt: CLAMPED, metadataUpdatedAt: CLAMPED };

describe("adoptBookStamps", () => {
	it("lets a newer position from another device land on the next pull", async () => {
		await adoptBookStamps("b1", pushed, stored);
		await pull(otherDevice({ wordPosition: 500, updatedAt: 3000 }));
		expect(row()).toMatchObject({ word_position: 500, updated_at: 3000 });
	});

	it("without it, the future stamp hides that position", async () => {
		await pull(otherDevice({ wordPosition: 500, updatedAt: 3000 }));
		expect(row()).toMatchObject({ word_position: 100, updated_at: FAST });
	});

	it("lets newer metadata from another device land on the next pull", async () => {
		await adoptBookStamps("b1", pushed, stored);
		await pull(otherDevice({ metadataUpdatedAt: 3000, rating: 5 }));
		expect(row()).toMatchObject({ rating: 5, metadata_updated_at: 3000 });
	});

	it("changes only the stamps, never the position or what the reader wrote", async () => {
		await adoptBookStamps("b1", pushed, stored);
		expect(row()).toEqual({
			word_position: 100,
			updated_at: CLAMPED,
			metadata_updated_at: CLAMPED,
			last_read: FAST,
			rating: 3,
		});
	});

	it("keeps a position saved while the push was in flight", async () => {
		await updateBook("b1", { wordPosition: wordPos(300), lastRead: FAST + 1 }, FAST + 1);
		await adoptBookStamps("b1", pushed, stored);
		expect(row()).toMatchObject({ word_position: 300, updated_at: FAST + 1 });
		expect(row().metadata_updated_at).toBe(CLAMPED);
	});

	it("lowers a clamped series revision so a newer series from elsewhere lands", async () => {
		raw.exec(`UPDATE books SET series_name = 'Mine', series_updated_at = ${FAST} WHERE id = 'b1'`);
		await adoptBookStamps(
			"b1",
			{ ...pushed, seriesUpdatedAt: FAST },
			{ ...stored, seriesUpdatedAt: CLAMPED },
		);
		await pull(otherDevice({ seriesName: "Theirs", seriesUpdatedAt: 3000 }));
		expect(
			raw.prepare("SELECT series_name, series_updated_at FROM books WHERE id = 'b1'").get(),
		).toEqual({ series_name: "Theirs", series_updated_at: 3000 });
	});

	it("never raises a stamp", async () => {
		await adoptBookStamps("b1", pushed, { updatedAt: FAST + 5, metadataUpdatedAt: FAST + 5 });
		expect(row()).toMatchObject({ updated_at: FAST, metadata_updated_at: FAST });
	});

	it("leaves the metadata stamp alone when the push carried none", async () => {
		await adoptBookStamps("b1", { updatedAt: FAST, metadataUpdatedAt: null }, stored);
		expect(row()).toMatchObject({ updated_at: CLAMPED, metadata_updated_at: FAST });
	});
});

describe("adoptSettingsStamp", () => {
	beforeEach(async () => {
		await getSettings();
		await saveSettings({ readerFontSize: 20 }, FAST);
	});

	it("lowers the stamp to the server's and keeps the values", async () => {
		await adoptSettingsStamp(FAST, CLAMPED);
		expect(await getSettings()).toMatchObject({ updatedAt: CLAMPED, readerFontSize: 20 });
	});

	it("keeps a settings edit made while the push was in flight", async () => {
		await saveSettings({ readerFontSize: 22 }, FAST + 1);
		await adoptSettingsStamp(FAST, CLAMPED);
		expect((await getSettings()).updatedAt).toBe(FAST + 1);
	});
});
