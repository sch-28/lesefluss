// @vitest-environment node
import { afterAll, describe, expect, it, vi } from "vitest";
import { createTestDb } from "./test-db";

const { db, raw, close } = createTestDb();
vi.mock("../index", () => ({
	get db() {
		return db;
	},
}));
afterAll(close);

const { getBookReadingSessions } = await import("../queries/reading-sessions");

function insertSession(id: string, bookId: string, startedAt: number) {
	raw
		.prepare(
			`INSERT INTO reading_sessions
			 (id, book_id, mode, started_at, ended_at, duration_ms, words_read, start_word, end_word, wpm_avg, updated_at)
			 VALUES (?, ?, 'scroll', ?, ?, 1000, 10, 0, 10, NULL, ?)`,
		)
		.run(id, bookId, startedAt, startedAt + 1000, startedAt + 1000);
}

describe("getBookReadingSessions", () => {
	it("returns only that book's sessions, newest first", async () => {
		insertSession("mid", "b1", 2000);
		insertSession("other", "b2", 5000);
		insertSession("old", "b1", 1000);
		insertSession("new", "b1", 3000);
		const rows = await getBookReadingSessions("b1");
		expect(rows.map((row) => row.id)).toEqual(["new", "mid", "old"]);
	});
});
