// @vitest-environment node
import { computeSpeedModel, type SpeedRow } from "@lesefluss/core";
import { afterAll, describe, expect, it, vi } from "vitest";
import { createTestDb } from "./test-db";

const { db, raw, close } = createTestDb();
vi.mock("../index", () => ({
	get db() {
		return db;
	},
}));
afterAll(close);

const { getBookStats, getSpeedModel } = await import("../queries/stats");

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const NOW = 1_800_000_000_000;

raw
	.prepare(
		"INSERT INTO books (id, title, file_format, size, word_position, is_active, added_at, deleted) VALUES ('b1','b1','epub',1,0,0,0,0)",
	)
	.run();

const rows: SpeedRow[] = [
	{
		bookId: "b1",
		mode: "scroll",
		startedAt: NOW - 40 * DAY,
		durationMs: 60 * MIN,
		wordsRead: 12_000,
		wpmAvg: null,
	},
	{
		bookId: "b1",
		mode: "page",
		startedAt: NOW - 3 * DAY,
		durationMs: 30 * MIN,
		wordsRead: 9_000,
		wpmAvg: null,
	},
	{
		bookId: "b1",
		mode: "rsvp",
		startedAt: NOW - 2 * DAY,
		durationMs: 20 * MIN,
		wordsRead: 8_000,
		wpmAvg: 600,
	},
	// A position jump: far too fast to be reading, so the model drops it.
	{
		bookId: "b1",
		mode: "scroll",
		startedAt: NOW - DAY,
		durationMs: MIN,
		wordsRead: 50_000,
		wpmAvg: null,
	},
];
rows.forEach((r, i) => {
	raw
		.prepare(
			`INSERT INTO reading_sessions
			 (id, book_id, mode, started_at, ended_at, duration_ms, words_read, start_word, end_word, wpm_avg, updated_at)
			 VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
		)
		.run(
			`s${i}`,
			r.bookId ?? null,
			r.mode,
			r.startedAt,
			r.startedAt + r.durationMs,
			r.durationMs,
			r.wordsRead,
			0,
			r.wordsRead,
			r.wpmAvg ?? null,
			r.startedAt,
		);
});

describe("getSpeedModel", () => {
	it("is the shared model over every stored session", async () => {
		for (const window of ["recent", "30d", "all"] as const) {
			const model = await getSpeedModel({ window, now: NOW });
			expect(model).toEqual(computeSpeedModel(rows, { window, now: NOW, speedTest: null }));
		}
	});

	it("applies the window and leaves the jump out", async () => {
		const month = await getSpeedModel({ window: "30d", now: NOW });
		expect(month.sittings).toBe(2);
		expect(month.reading).toMatchObject({ wpm: 300, source: "measured" });
		expect(month.rsvp?.wpm).toBe(400);
		const all = await getSpeedModel({ window: "all", now: NOW });
		expect(all.sittings).toBe(3);
		expect(all.reading.wpm).toBe(233);
	});

	it("gives book detail the model's own book speed", async () => {
		const model = await getSpeedModel({ window: "recent", now: NOW });
		const stats = await getBookStats("b1");
		expect(stats.measuredWpm).toBe(model.books.b1?.wpm);
		expect(stats.dominantMode).toBe(model.books.b1?.mode);
	});
});
