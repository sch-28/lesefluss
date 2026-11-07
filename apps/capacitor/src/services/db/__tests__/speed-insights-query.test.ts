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

const { getMilestones, getSpeedInsights } = await import("../queries/stats");

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const NOW = 1_800_000_000_000;
const FINISHED_AT = NOW - 5 * DAY;

const insertBook = raw.prepare(
	"INSERT INTO books (id, title, file_format, size, word_position, is_active, added_at, deleted, word_count, status, finished_at, series_id, chapter_index) VALUES (?, ?, 'epub', 1, 0, 0, 0, ?, 1000, ?, ?, ?, ?)",
);
insertBook.run("b1", "b1", 0, "finished", FINISHED_AT, null, null);
insertBook.run("deleted", "deleted", 1, "finished", NOW - 4 * DAY, null, null);
insertBook.run("chapter", "chapter", 0, "finished", NOW - 3 * DAY, "s1", 1);
insertBook.run("reopened", "reopened", 0, "reading", NOW - 2 * DAY, null, null);

const insertSession = raw.prepare(
	"INSERT INTO reading_sessions (id, book_id, mode, started_at, ended_at, duration_ms, words_read, start_word, end_word, wpm_avg, updated_at, font_size, segment_wpm) VALUES (?, 'b1', 'scroll', ?, ?, ?, ?, 0, 0, NULL, ?, ?, ?)",
);
function session(
	id: string,
	startedAt: number,
	minutes: number,
	words: number,
	fontSize: number,
	segments: number[],
) {
	insertSession.run(
		id,
		startedAt,
		startedAt + minutes * MIN,
		minutes * MIN,
		words,
		startedAt,
		fontSize,
		JSON.stringify(segments),
	);
}
const tiring = [300, 300, 250, 240];
session("s16a", NOW - 6 * DAY, 40, 10_000, 16, tiring);
session("s20a", NOW - 4 * DAY, 20, 6_000, 20, tiring);
session("s20b", NOW - 2 * DAY, 20, 6_000, 20, tiring);
// Fastest of all, but outside the 30 day window.
session("old", NOW - 60 * DAY, 60, 30_000, 24, [500, 500, 500, 500]);

describe("getSpeedInsights", () => {
	it("builds the font size and fatigue tiles from the window's stored columns", async () => {
		const { reading, rsvp } = await getSpeedInsights({ window: "30d", now: NOW });
		const byId = new Map(reading.map((i) => [i.id, i]));
		expect(byId.get("font-size")).toMatchObject({ label: "Best size", value: "20 px" });
		expect(byId.get("fatigue")).toMatchObject({ label: "Slows after", value: "20m" });
		expect(byId.has("scroll-vs-page")).toBe(false);
		expect(rsvp).toEqual([]);
	});

	it("lets the older sitting win once the window takes it in", async () => {
		const { reading } = await getSpeedInsights({ window: "all", now: NOW });
		expect(reading.find((i) => i.id === "font-size")?.value).toBe("24 px");
	});
});

describe("getMilestones", () => {
	it("counts finished books only, leaving out deleted, serial and reopened ones", async () => {
		const { reached, next } = await getMilestones();
		expect(reached.find((m) => m.kind === "books")).toEqual({
			kind: "books",
			threshold: 1,
			reachedAt: FINISHED_AT,
		});
		expect(next.find((m) => m.kind === "books")).toMatchObject({ threshold: 5, current: 1 });
	});
});
