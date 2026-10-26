// @vitest-environment node
import { wordPos } from "@lesefluss/core";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "./test-db";

const { db, raw, close } = createTestDb();
vi.mock("../index", () => ({
	get db() {
		return db;
	},
}));
afterAll(close);

const { applyBookMerge, writeReaderPosition } = await import("../queries/books");

const row = () =>
	raw.prepare("SELECT word_position, updated_at FROM books WHERE id = 'b1'").get() as {
		word_position: number;
		updated_at: number;
	};

beforeEach(() => {
	raw.exec("DELETE FROM books");
	raw
		.prepare(
			`INSERT INTO books (id, title, file_format, size, word_position, word_count, is_active, added_at, deleted, updated_at, metadata_updated_at, last_read)
			 VALUES ('b1', 'Book', 'epub', 1, 100, 1000, 0, 500, 0, 1000, 1000, 1000)`,
		)
		.run();
});

describe("writeReaderPosition", () => {
	it("lands on a row whose revision the reader has seen", async () => {
		const result = await writeReaderPosition("b1", {
			wordPosition: wordPos(150),
			lastRead: 2000,
			baseRev: 1000,
		});
		expect(result.isWritten).toBe(true);
		expect(row()).toEqual({ word_position: 150, updated_at: 2000 });
	});

	it("never replaces a newer position written meanwhile, and reports it", async () => {
		// A pull lands a position from another device after the reader last looked.
		await applyBookMerge(
			"b1",
			{ wordPosition: wordPos(400), updatedAt: 1500, lastRead: 1500 },
			1500,
		);

		const result = await writeReaderPosition("b1", {
			wordPosition: wordPos(150),
			lastRead: 2000,
			baseRev: 1000,
		});

		expect(result.isWritten).toBe(false);
		expect(result.row).toEqual({ wordPosition: 400, updatedAt: 1500 });
		expect(row()).toEqual({ word_position: 400, updated_at: 1500 });
	});

	it("lands once the reader has seen the newer revision (it chose to keep its own)", async () => {
		await applyBookMerge(
			"b1",
			{ wordPosition: wordPos(400), updatedAt: 1500, lastRead: 1500 },
			1500,
		);

		const result = await writeReaderPosition("b1", {
			wordPosition: wordPos(150),
			lastRead: 2000,
			baseRev: 1500,
		});

		expect(result.isWritten).toBe(true);
		expect(row()).toEqual({ word_position: 150, updated_at: 2000 });
	});

	it("stamps above the seen revision when this clock is behind the one that wrote it", async () => {
		const result = await writeReaderPosition("b1", {
			wordPosition: wordPos(150),
			lastRead: 900,
			baseRev: 1000,
		});

		expect(result).toMatchObject({ isWritten: true, stamp: 1001 });
		expect(row()).toEqual({ word_position: 150, updated_at: 1001 });
	});

	it("reports no row for a book that is gone", async () => {
		raw.exec("DELETE FROM books");
		const result = await writeReaderPosition("b1", {
			wordPosition: wordPos(150),
			lastRead: 2000,
			baseRev: 1000,
		});
		expect(result).toMatchObject({ isWritten: false, row: null });
	});

	it("marks the book finished the first time the position crosses the end", async () => {
		await writeReaderPosition("b1", { wordPosition: wordPos(999), lastRead: 2000, baseRev: 1000 });
		const { finished_at } = raw.prepare("SELECT finished_at FROM books WHERE id = 'b1'").get() as {
			finished_at: number | null;
		};
		expect(finished_at).toBe(2000);
	});

	it("a pull and a reader write in either order end with the newest revision", async () => {
		await writeReaderPosition("b1", { wordPosition: wordPos(150), lastRead: 2000, baseRev: 1000 });
		await applyBookMerge(
			"b1",
			{ wordPosition: wordPos(400), updatedAt: 1500, lastRead: 1500 },
			1500,
		);
		expect(row()).toEqual({ word_position: 150, updated_at: 2000 });

		raw.exec("UPDATE books SET word_position = 100, updated_at = 1000 WHERE id = 'b1'");
		await applyBookMerge(
			"b1",
			{ wordPosition: wordPos(400), updatedAt: 2500, lastRead: 2500 },
			2500,
		);
		await writeReaderPosition("b1", { wordPosition: wordPos(150), lastRead: 2000, baseRev: 1000 });
		expect(row()).toEqual({ word_position: 400, updated_at: 2500 });
	});
});

describe("applyBookMerge", () => {
	it("hands back a position it skipped because the reader saved a newer one", async () => {
		await writeReaderPosition("b1", { wordPosition: wordPos(150), lastRead: 2000, baseRev: 1000 });

		const { skippedPosition } = await applyBookMerge(
			"b1",
			{ wordPosition: wordPos(400), updatedAt: 1500, lastRead: 1500 },
			1500,
		);

		expect(skippedPosition).toEqual({ wordPosition: 400, updatedAt: 1500 });
	});

	it("hands back nothing when the position applied", async () => {
		const { skippedPosition } = await applyBookMerge(
			"b1",
			{ wordPosition: wordPos(400), updatedAt: 1500, lastRead: 1500 },
			1500,
		);
		expect(skippedPosition).toBeNull();
	});
});
