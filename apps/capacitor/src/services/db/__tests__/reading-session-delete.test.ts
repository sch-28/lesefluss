// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "./test-db";

const { db, raw, close } = createTestDb();
vi.mock("../index", () => ({
	get db() {
		return db;
	},
}));
afterAll(close);

const { deleteReadingSessions } = await import("../queries/reading-sessions");

function insertSession(id: string) {
	raw
		.prepare(
			`INSERT INTO reading_sessions
			 (id, book_id, mode, started_at, ended_at, duration_ms, words_read, start_word, end_word, wpm_avg, updated_at)
			 VALUES (?, 'b1', 'scroll', 0, 1000, 1000, 10, 0, 10, NULL, 1000)`,
		)
		.run(id);
}

function heldIds(): string[] {
	return (raw.prepare("SELECT id FROM reading_sessions ORDER BY id").all() as { id: string }[]).map(
		(row) => row.id,
	);
}

beforeEach(() => {
	raw.exec("DELETE FROM reading_sessions");
});

describe("deleteReadingSessions", () => {
	it("removes the listed sessions and skips ids not held here", async () => {
		insertSession("a");
		insertSession("b");
		insertSession("keep");
		await deleteReadingSessions(["a", "b", "never-here"]);
		expect(heldIds()).toEqual(["keep"]);
	});

	it("deletes across chunk boundaries", async () => {
		const ids = Array.from({ length: 2500 }, (_, i) => `s${i}`);
		for (const id of ids) insertSession(id);
		insertSession("keep");
		await deleteReadingSessions(ids);
		expect(heldIds()).toEqual(["keep"]);
	});
});
