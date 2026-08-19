// @vitest-environment node
/**
 * The two startup backfills, against real SQLite.
 *
 * Both exist to repair libraries that arrived from the server with no local
 * read history, so their whole subject is what the stored dates say versus what
 * the reading sessions prove. A mocked db would assert the SQL was assembled a
 * certain way rather than that it answers that question.
 */
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

const { backfillAddedAt, backfillFinishedAt } = await import("../queries/books");

const DAY = 86_400_000;
/** Fixtures sit in real calendar time: the add-date backfill discards sittings
 *  from before the app existed. */
const BASE = Date.UTC(2026, 0, 1);

function insertBook(overrides: Partial<Record<string, unknown>> = {}) {
	const row = {
		id: "b1",
		title: "A Book",
		file_format: "epub",
		size: 1,
		word_position: 100,
		word_count: 100,
		is_active: 0,
		added_at: BASE + 10 * DAY,
		deleted: 0,
		series_id: null,
		...overrides,
	};
	const keys = Object.keys(row);
	raw
		.prepare(`INSERT INTO books (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`)
		.run(...(Object.values(row) as SQLInputValue[]));
}

let sessionSeq = 0;
function insertSession(bookId: string, startedAt: number, endedAt: number) {
	raw
		.prepare(
			`INSERT INTO reading_sessions
			 (id, book_id, mode, started_at, ended_at, duration_ms, words_read, start_word, end_word, updated_at)
			 VALUES (?,?,?,?,?,?,?,?,?,?)`,
		)
		.run(
			`s${sessionSeq++}`,
			bookId,
			"rsvp",
			startedAt,
			endedAt,
			endedAt - startedAt,
			100,
			0,
			100,
			0,
		);
}

function readBook(id = "b1") {
	return raw.prepare("SELECT added_at, finished_at FROM books WHERE id = ?").get(id) as {
		added_at: number;
		finished_at: number | null;
	};
}

beforeEach(() => {
	raw.exec("DELETE FROM books; DELETE FROM reading_sessions");
});

describe("backfillAddedAt", () => {
	it("pulls an add date back to the first sitting that pre-dates it", async () => {
		insertBook({ added_at: BASE + 10 * DAY });
		insertSession("b1", BASE + 3 * DAY, BASE + 3 * DAY + 1000);
		insertSession("b1", BASE + 7 * DAY, BASE + 7 * DAY + 1000);

		await backfillAddedAt();

		expect(readBook().added_at).toBe(BASE + 3 * DAY);
	});

	it("leaves a book whose sessions all post-date the add date alone", async () => {
		insertBook({ added_at: BASE + 2 * DAY });
		insertSession("b1", BASE + 5 * DAY, BASE + 5 * DAY + 1000);

		await backfillAddedAt();

		expect(readBook().added_at).toBe(BASE + 2 * DAY);
	});

	it("invents nothing for a book that was never read", async () => {
		insertBook({ added_at: BASE + 10 * DAY });

		await backfillAddedAt();

		expect(readBook().added_at).toBe(BASE + 10 * DAY);
	});

	// A device reading before its clock has synced stamps a sitting near the
	// epoch. The merge only ever moves the date earlier, so adopting one would
	// ratchet this book to 1970 on every device the library reaches.
	it("ignores a sitting from a device whose clock had not synced", async () => {
		insertBook({ added_at: BASE + 10 * DAY });
		insertSession("b1", 5000, 6000);
		insertSession("b1", Date.UTC(2026, 0, 5), Date.UTC(2026, 0, 5) + 1000);

		await backfillAddedAt();

		expect(readBook().added_at).toBe(Date.UTC(2026, 0, 5));
	});

	it("is idempotent", async () => {
		insertBook({ added_at: BASE + 10 * DAY });
		insertSession("b1", BASE + 3 * DAY, BASE + 3 * DAY + 1000);

		await backfillAddedAt();
		await backfillAddedAt();

		expect(readBook().added_at).toBe(BASE + 3 * DAY);
	});

	it("corrects each book against its own sessions", async () => {
		insertBook({ id: "b1", added_at: BASE + 10 * DAY });
		insertBook({ id: "b2", added_at: BASE + 10 * DAY });
		insertSession("b1", BASE + 3 * DAY, BASE + 3 * DAY + 1000);
		insertSession("b2", BASE + 6 * DAY, BASE + 6 * DAY + 1000);

		await backfillAddedAt();

		expect(readBook("b1").added_at).toBe(BASE + 3 * DAY);
		expect(readBook("b2").added_at).toBe(BASE + 6 * DAY);
	});
});

describe("backfillFinishedAt", () => {
	it("dates a finish from the last sitting rather than from the add date", async () => {
		insertBook({ added_at: BASE + 3 * DAY });
		insertSession("b1", BASE + 3 * DAY, BASE + 3 * DAY + 1000);
		insertSession("b1", BASE + 8 * DAY, BASE + 8 * DAY + 5000);

		await backfillFinishedAt();

		expect(readBook().finished_at).toBe(BASE + 8 * DAY + 5000);
	});

	it("prefers last_read over the sessions", async () => {
		insertBook({ added_at: BASE + 3 * DAY, last_read: BASE + 9 * DAY });
		insertSession("b1", BASE + 8 * DAY, BASE + 8 * DAY + 5000);

		await backfillFinishedAt();

		expect(readBook().finished_at).toBe(BASE + 9 * DAY);
	});

	it("falls back to the add date for a restored book with no sessions", async () => {
		insertBook({ added_at: BASE + 3 * DAY });

		await backfillFinishedAt();

		expect(readBook().finished_at).toBe(BASE + 3 * DAY);
	});

	it("leaves an unfinished book unstamped", async () => {
		insertBook({ word_position: 10, word_count: 100 });
		insertSession("b1", BASE + 3 * DAY, BASE + 3 * DAY + 1000);

		await backfillFinishedAt();

		expect(readBook().finished_at).toBeNull();
	});

	it("only ever fills nulls", async () => {
		insertBook({ added_at: BASE + 3 * DAY, finished_at: BASE + 4 * DAY });
		insertSession("b1", BASE + 8 * DAY, BASE + 8 * DAY + 5000);

		await backfillFinishedAt();

		expect(readBook().finished_at).toBe(BASE + 4 * DAY);
	});
});
