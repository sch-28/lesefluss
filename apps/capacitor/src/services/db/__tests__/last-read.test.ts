// @vitest-environment node
import type { SQLInputValue } from "node:sqlite";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "./test-db";

const { db, raw, close } = createTestDb();
vi.mock("../index", () => ({
	get db() {
		return db;
	},
}));
afterAll(close);

const { getLastReadBookId } = await import("../queries/last-read");

function insertBook(id: string, overrides: Record<string, SQLInputValue> = {}) {
	const row: Record<string, SQLInputValue> = {
		id,
		title: id,
		file_format: "epub",
		size: 1,
		word_position: 0,
		is_active: 0,
		added_at: 0,
		deleted: 0,
		...overrides,
	};
	const keys = Object.keys(row);
	raw
		.prepare(`INSERT INTO books (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`)
		.run(...Object.values(row));
}

let sessionSeq = 0;
function insertSession(bookId: string, endedAt: number) {
	sessionSeq += 1;
	raw
		.prepare(
			`INSERT INTO reading_sessions
			 (id, book_id, mode, started_at, ended_at, duration_ms, words_read, start_word, end_word, wpm_avg, updated_at)
			 VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
		)
		.run(
			`s${sessionSeq}`,
			bookId,
			"scroll",
			endedAt - 60_000,
			endedAt,
			60_000,
			200,
			0,
			200,
			null,
			endedAt,
		);
}

let chapterSeq = 0;
function insertChapter(id: string, overrides: Record<string, SQLInputValue> = {}) {
	chapterSeq += 1;
	insertBook(id, {
		series_id: "s1",
		chapter_index: chapterSeq,
		chapter_status: "fetched",
		...overrides,
	});
}

beforeEach(() => {
	raw.exec("DELETE FROM books");
	raw.exec("DELETE FROM reading_sessions");
});

describe("getLastReadBookId", () => {
	it("is null when no book has been opened", async () => {
		insertBook("b1");
		expect(await getLastReadBookId()).toBeNull();
	});

	it("picks the standalone book with the newest lastRead", async () => {
		insertBook("b1", { last_read: 100 });
		insertBook("b2", { last_read: 200 });
		insertBook("b3", { added_at: 999 });
		expect(await getLastReadBookId()).toBe("b2");
	});

	it("ignores a chapter whose lastRead only moved because it was fetched", async () => {
		insertBook("b1", { last_read: 100 });
		insertChapter("ch1", { last_read: 500 });
		insertChapter("ch2", { last_read: 600, chapter_status: "error" });
		expect(await getLastReadBookId()).toBe("b1");
	});

	it("picks a chapter by its newest reading session", async () => {
		insertBook("b1", { last_read: 100 });
		insertChapter("ch1", { last_read: 900 });
		insertChapter("ch2", { last_read: 950 });
		insertSession("ch1", 300);
		insertSession("ch2", 200);
		expect(await getLastReadBookId()).toBe("ch1");
	});

	it("prefers a standalone book read after the last chapter session", async () => {
		insertChapter("ch1");
		insertSession("ch1", 300);
		insertBook("b1", { last_read: 400 });
		expect(await getLastReadBookId()).toBe("b1");
	});

	it("skips sessions on chapters that are no longer readable", async () => {
		insertBook("b1", { last_read: 100 });
		insertChapter("ch1", { chapter_status: "locked" });
		insertChapter("ch2", { deleted: 1 });
		insertSession("ch1", 300);
		insertSession("ch2", 300);
		expect(await getLastReadBookId()).toBe("b1");
	});

	it("skips deleted books", async () => {
		insertBook("b1", { last_read: 100 });
		insertBook("b2", { last_read: 200, deleted: 1 });
		expect(await getLastReadBookId()).toBe("b1");
	});
});
