// @vitest-environment node
/**
 * Query-level tests for the stats surface, against real SQLite.
 *
 * The load-bearing claim these exist for: the plausibility ceiling discards a
 * sitting's *rate* and nothing else. Time read and words read are what the
 * reader actually spent and covered, so a position jump must still count toward
 * both. That guarantee lives here, in the query layer, and was previously only
 * pinned indirectly through the pure aggregation module.
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

const { getBookStats, getPeriodTotals, getTopBooks } = await import("../queries/stats");

const BOOK_ID = "b1";
const MINUTE = 60_000;

function insertBook(overrides: Partial<Record<string, unknown>> = {}) {
	const row = {
		id: BOOK_ID,
		title: "A Book",
		author: "Someone",
		file_format: "epub",
		size: 1,
		word_position: 0,
		word_count: 100_000,
		is_active: 0,
		added_at: 0,
		deleted: 0,
		series_id: null,
		...overrides,
	};
	const keys = Object.keys(row);
	raw
		.prepare(`INSERT INTO books (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`)
		.run(...(Object.values(row) as SQLInputValue[]));
}

function insertSeries(id: string, title: string) {
	raw
		.prepare(
			`INSERT INTO series (id, title, source_url, toc_url, provider, created_at, updated_at, deleted)
			 VALUES (?,?,?,?,?,?,?,?)`,
		)
		.run(id, title, "https://example.test", "https://example.test/toc", "royalroad", 0, 0, 0);
}

let sessionSeq = 0;
function insertSession(opts: {
	startedAt: number;
	durationMs: number;
	wordsRead: number;
	mode?: string;
	bookId?: string;
}) {
	sessionSeq += 1;
	raw
		.prepare(
			`INSERT INTO reading_sessions
			 (id, book_id, mode, started_at, ended_at, duration_ms, words_read, start_word, end_word, wpm_avg, updated_at)
			 VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
		)
		.run(
			`s${sessionSeq}`,
			opts.bookId ?? BOOK_ID,
			opts.mode ?? "scroll",
			opts.startedAt,
			opts.startedAt + opts.durationMs,
			opts.durationMs,
			opts.wordsRead,
			0,
			opts.wordsRead,
			null,
			opts.startedAt,
		);
}

/** 10 minutes, 3000 words: an ordinary 300 wpm sitting. */
const HONEST = { durationMs: 10 * MINUTE, wordsRead: 3000 };
/** 27 seconds, 22488 words: a position jump, taken from the real device DB. */
const JUMP = { durationMs: 27_000, wordsRead: 22_488 };

beforeEach(() => {
	raw.exec("DELETE FROM reading_sessions");
	raw.exec("DELETE FROM books");
	raw.exec("DELETE FROM series");
	sessionSeq = 0;
});

describe("getBookStats", () => {
	it("counts a position jump toward time, but not toward speed", async () => {
		insertBook();
		insertSession({ startedAt: 1000, ...HONEST });
		insertSession({ startedAt: 2000, ...JUMP });

		const s = await getBookStats(BOOK_ID);
		// Totals are what the reader spent and covered: both sittings count.
		expect(s.totalDurationMs).toBe(HONEST.durationMs + JUMP.durationMs);
		expect(s.sessionCount).toBe(2);
		// The rate is only the honest sitting. Including the jump would give
		// roughly 2400 wpm.
		expect(s.measuredWpm).toBe(300);
	});

	it("leaves the speed unmeasured when every sitting is implausible", async () => {
		insertBook();
		insertSession({ startedAt: 1000, ...JUMP });

		const s = await getBookStats(BOOK_ID);
		expect(s.totalDurationMs).toBe(JUMP.durationMs);
		expect(s.sessionCount).toBe(1);
		expect(s.measuredWpm).toBeNull();
		expect(s.speedSeries).toEqual([]);
	});
});

describe("getPeriodTotals", () => {
	it("counts every sitting's time and words, ceiling or not", async () => {
		insertBook();
		insertSession({ startedAt: 1000, ...HONEST });
		// 90 seconds, so the literal below distinguishes rounding from truncation.
		insertSession({ startedAt: 2000, durationMs: 90_000, wordsRead: 22_488 });

		const totals = await getPeriodTotals(0, 10_000);
		expect(totals.words).toBe(HONEST.wordsRead + 22_488);
		// 10min + 1.5min, rounded. Truncating would give 11.
		expect(totals.minutes).toBe(12);
	});

	it("excludes sittings on either side of the window", async () => {
		insertBook();
		insertSession({ startedAt: 500, ...HONEST }); // before periodStart
		insertSession({ startedAt: 5000, ...HONEST }); // inside
		insertSession({ startedAt: 20_000, ...HONEST }); // after periodEnd

		const totals = await getPeriodTotals(1000, 10_000);
		expect(totals.words).toBe(HONEST.wordsRead);
	});
});

describe("getTopBooks", () => {
	it("reports overall progress, not what was read in the window", async () => {
		insertBook({ word_position: 40_000, word_count: 100_000 });
		insertSession({ startedAt: 5000, durationMs: MINUTE, wordsRead: 10 });

		const [top] = await getTopBooks({ since: 4000 });
		expect(top?.wordPosition).toBe(40_000);
		expect(top?.wordCount).toBe(100_000);
	});

	it("folds a serial's chapters into one entry summing their length", async () => {
		insertBook({ id: "c1", series_id: "s1", word_count: 30_000, word_position: 30_000 });
		insertBook({ id: "c2", series_id: "s1", word_count: 20_000, word_position: 5_000 });
		insertSeries("s1", "A Serial");
		insertSession({ startedAt: 1000, bookId: "c1", ...HONEST });
		insertSession({ startedAt: 2000, bookId: "c2", ...HONEST });

		const works = await getTopBooks({ since: 0 });
		expect(works).toHaveLength(1);
		expect(works[0]?.isSeries).toBe(true);
		expect(works[0]?.title).toBe("A Serial");
		expect(works[0]?.wordCount).toBe(50_000);
		expect(works[0]?.wordPosition).toBe(35_000);
		expect(works[0]?.durationMs).toBe(2 * HONEST.durationMs);
	});

	it("omits deleted books", async () => {
		insertBook({ deleted: 1 });
		insertSession({ startedAt: 1000, ...HONEST });

		expect(await getTopBooks({ since: 0 })).toEqual([]);
	});
});
