// @vitest-environment node
import { bookStatus, wordPos } from "@lesefluss/core";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyMigration, createTestDb } from "./test-db";

const { db, raw, close } = createTestDb();
vi.mock("../index", () => ({
	get db() {
		return db;
	},
}));
afterAll(close);

const { getBook, markFirstSitting, writeReaderPosition } = await import("../queries/books");
const { getCurrentlyReading } = await import("../queries/stats");

const insertBook = (id: string) =>
	raw
		.prepare(
			`INSERT INTO books (id, title, file_format, size, word_position, word_count, is_active, added_at, deleted, updated_at, last_read)
			 VALUES (?, 'Book', 'epub', 1, 0, 100000, 0, 500, 0, 1000, NULL)`,
		)
		.run(id);

async function statusOf(id: string) {
	const book = await getBook(id);
	if (!book) throw new Error(`no book ${id}`);
	return bookStatus(book);
}

const shelf = async () => (await getCurrentlyReading()).map((b) => b.id);

beforeEach(() => {
	raw.exec("DELETE FROM books");
	insertBook("b1");
});

describe("an Automatic book and its first real sitting", () => {
	it("stays on Want to read after a short sitting, and its position is still saved", async () => {
		const result = await writeReaderPosition("b1", {
			wordPosition: wordPos(400),
			lastRead: 2000,
			baseRev: 1000,
		});

		expect(result.isWritten).toBe(true);
		expect((await getBook("b1"))?.wordPosition).toBe(400);
		expect(await statusOf("b1")).toBe("want");
		expect(await shelf()).toEqual([]);
	});

	it("moves to Reading once a real sitting is recorded, with the position saved as well", async () => {
		const result = await writeReaderPosition("b1", {
			wordPosition: wordPos(400),
			lastRead: 2000,
			baseRev: 1000,
		});
		await markFirstSitting("b1", 1500);

		expect(result.isWritten).toBe(true);
		expect(await getBook("b1")).toMatchObject({ wordPosition: 400, firstSittingAt: 1500 });
		expect(await statusOf("b1")).toBe("reading");
		expect(await shelf()).toEqual(["b1"]);
	});

	it("keeps the earliest first sitting", async () => {
		await markFirstSitting("b1", 1500);
		await markFirstSitting("b1", 9000);
		expect((await getBook("b1"))?.firstSittingAt).toBe(1500);
		await markFirstSitting("b1", 700);
		expect((await getBook("b1"))?.firstSittingAt).toBe(700);
	});

	it("never stops a position write: one after the marker lands too", async () => {
		await markFirstSitting("b1", 1500);
		const result = await writeReaderPosition("b1", {
			wordPosition: wordPos(800),
			lastRead: 3000,
			baseRev: 1000,
		});
		expect(result.isWritten).toBe(true);
		expect((await getBook("b1"))?.wordPosition).toBe(800);
	});
});

describe("the first-sitting backfill", () => {
	it("marks from the earliest sitting of a minute or more, or from a position read before sessions existed", () => {
		const old = createTestDb({ stopBefore: "0061_first_sitting_at" });
		const book = (id: string, wordPosition: number, lastRead: number | null) =>
			old.raw
				.prepare(
					`INSERT INTO books (id, title, file_format, size, word_position, word_count, is_active, added_at, deleted, updated_at, last_read)
					 VALUES (?, 'Book', 'epub', 1, ?, 100000, 0, 500, 0, 1000, ?)`,
				)
				.run(id, wordPosition, lastRead);
		const session = (id: string, bookId: string, startedAt: number, durationMs: number) =>
			old.raw
				.prepare(
					`INSERT INTO reading_sessions (id, book_id, mode, started_at, ended_at, duration_ms, words_read, start_word, end_word, updated_at)
					 VALUES (?, ?, 'scroll', ?, ?, ?, 10, 0, 10, ?)`,
				)
				.run(id, bookId, startedAt, startedAt + durationMs, durationMs, startedAt);

		book("long", 400, 9000);
		session("s1", "long", 3000, 120_000);
		session("s2", "long", 2000, 30_000);
		session("s3", "long", 4000, 60_000);
		book("legacy", 400, 8000);
		book("short", 400, 7000);
		session("s4", "short", 2000, 59_999);
		book("unopened", 0, null);

		applyMigration(old.raw, "0061_first_sitting_at");

		const marks = Object.fromEntries(
			(
				old.raw.prepare("SELECT id, first_sitting_at FROM books").all() as Array<{
					id: string;
					first_sitting_at: number | null;
				}>
			).map((r) => [r.id, r.first_sitting_at]),
		);
		old.close();
		expect(marks).toEqual({ long: 3000, legacy: 8000, short: null, unopened: null });
	});
});
