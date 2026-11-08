// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "./test-db";

const { db, raw, close } = createTestDb();
vi.mock("../index", () => ({
	get db() {
		return db;
	},
}));
vi.mock("@capacitor/preferences", () => ({
	Preferences: { get: async () => ({ value: null }), set: async () => {} },
}));
afterAll(close);

const { addSpeedTest, getSpeedTests, upsertSpeedTests, hardDeleteSpeedTests, deleteAllSpeedTests } =
	await import("../queries/speed-tests");
const { getSpeedModel, getWpmTrend } = await import("../queries/stats");

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const NOW = 1_800_000_000_000;

raw
	.prepare(
		"INSERT INTO books (id, title, file_format, size, word_position, is_active, added_at, deleted) VALUES ('b1','b1','epub',1,0,0,0,0)",
	)
	.run();

beforeEach(() => {
	raw.exec("DELETE FROM speed_tests; DELETE FROM reading_sessions;");
});

function addSession(startedAt: number, minutes: number, words: number) {
	raw
		.prepare(
			`INSERT INTO reading_sessions
			 (id, book_id, mode, started_at, ended_at, duration_ms, words_read, start_word, end_word, wpm_avg, updated_at)
			 VALUES (?,'b1','scroll',?,?,?,?,0,?,NULL,?)`,
		)
		.run(
			`s${startedAt}`,
			startedAt,
			startedAt + minutes * MIN,
			minutes * MIN,
			words,
			words,
			startedAt,
		);
}

describe("speed test rows", () => {
	it("list newest first", async () => {
		await addSpeedTest({ readingWpm: 250.4, rsvpWpm: null, passageId: "canal-1" }, NOW - DAY);
		await addSpeedTest({ readingWpm: 280, rsvpWpm: 401.6, passageId: "orchard-1" }, NOW);
		const tests = await getSpeedTests();
		expect(tests.map((t) => [t.readingWpm, t.rsvpWpm])).toEqual([
			[280, 402],
			[250, null],
		]);
	});

	it("clamps a kept implausible speed to what sync accepts", async () => {
		await addSpeedTest({ readingWpm: 12_000, rsvpWpm: 0.2, passageId: "canal-1" }, NOW);
		const [test] = await getSpeedTests();
		expect([test?.readingWpm, test?.rsvpWpm]).toEqual([5000, 1]);
	});

	it("upsert only over an older row, and delete by id or all", async () => {
		const mine = await addSpeedTest({ readingWpm: 250, rsvpWpm: null, passageId: "canal-1" }, NOW);
		await upsertSpeedTests([
			{ ...mine, readingWpm: 999, updatedAt: NOW - 1 },
			{ ...mine, id: "other", updatedAt: NOW },
		]);
		expect((await getSpeedTests()).map((t) => t.readingWpm)).toEqual([250, 250]);
		await upsertSpeedTests([{ ...mine, readingWpm: 300, updatedAt: NOW + 1 }]);
		expect((await getSpeedTests()).find((t) => t.id === mine.id)?.readingWpm).toBe(300);
		await hardDeleteSpeedTests([mine.id]);
		expect((await getSpeedTests()).map((t) => t.id)).toEqual(["other"]);
		await deleteAllSpeedTests();
		expect(await getSpeedTests()).toEqual([]);
	});
});

describe("getSpeedModel with a speed test", () => {
	it("falls back to the latest test before 10 minutes of reading, then to 225", async () => {
		expect((await getSpeedModel({ window: "recent", now: NOW })).reading).toMatchObject({
			wpm: 225,
			source: "default",
		});
		await addSpeedTest({ readingWpm: 240, rsvpWpm: null, passageId: "canal-1" }, NOW - 2 * DAY);
		await addSpeedTest({ readingWpm: 310, rsvpWpm: 450, passageId: "orchard-1" }, NOW - DAY);
		addSession(NOW - 3 * MIN, 3, 600);
		expect((await getSpeedModel({ window: "recent", now: NOW })).reading).toMatchObject({
			wpm: 310,
			source: "test",
		});
	});

	it("skips a kept implausible test for the last plausible one, else 225", async () => {
		await addSpeedTest({ readingWpm: 1_400, rsvpWpm: null, passageId: "canal-1" }, NOW - DAY);
		expect((await getSpeedModel({ window: "recent", now: NOW })).reading).toMatchObject({
			wpm: 225,
			source: "default",
		});
		await addSpeedTest({ readingWpm: 260, rsvpWpm: null, passageId: "orchard-1" }, NOW - 2 * DAY);
		await addSpeedTest({ readingWpm: 90, rsvpWpm: null, passageId: "canal-1" }, NOW);
		expect((await getSpeedModel({ window: "recent", now: NOW })).reading).toMatchObject({
			wpm: 260,
			source: "test",
		});
		const trend = await getWpmTrend({ window: "30d", mode: "reading", now: NOW });
		expect(trend.tests.map((t) => t.wpm)).toEqual([260, 1_400, 90]);
	});

	it("counts 120 and 900 as plausible, 119 and 901 not, for reading and pace", async () => {
		await addSpeedTest({ readingWpm: 900, rsvpWpm: null, passageId: "canal-1" }, NOW - 3 * DAY);
		await addSpeedTest({ readingWpm: 901, rsvpWpm: null, passageId: "canal-1" }, NOW - 2 * DAY);
		await addSpeedTest({ readingWpm: 119, rsvpWpm: null, passageId: "canal-1" }, NOW - DAY);
		let model = await getSpeedModel({ window: "recent", now: NOW });
		expect(model.reading).toMatchObject({ wpm: 900, source: "test" });
		expect(model.pace).toMatchObject({ wpm: 900, source: "test" });
		await addSpeedTest({ readingWpm: 120, rsvpWpm: null, passageId: "canal-1" }, NOW);
		model = await getSpeedModel({ window: "recent", now: NOW });
		expect(model.reading).toMatchObject({ wpm: 120, source: "test" });
		expect(model.pace).toMatchObject({ wpm: 120, source: "test" });
	});

	it("gives way to measured reading", async () => {
		await addSpeedTest({ readingWpm: 310, rsvpWpm: null, passageId: "canal-1" }, NOW - DAY);
		addSession(NOW - 60 * MIN, 30, 6_000);
		expect((await getSpeedModel({ window: "recent", now: NOW })).reading).toMatchObject({
			wpm: 200,
			source: "measured",
		});
	});
});

describe("getWpmTrend with speed tests", () => {
	it("marks each test on the trend, its RSVP figure in RSVP mode", async () => {
		await addSpeedTest({ readingWpm: 240, rsvpWpm: null, passageId: "canal-1" }, NOW - 10 * DAY);
		await addSpeedTest({ readingWpm: 310, rsvpWpm: 450, passageId: "orchard-1" }, NOW - DAY);
		const reading = await getWpmTrend({ window: "30d", mode: "reading", now: NOW });
		expect(reading.tests.map((t) => t.wpm)).toEqual([240, 310]);
		const rsvp = await getWpmTrend({ window: "30d", mode: "rsvp", now: NOW });
		expect(rsvp.tests.map((t) => t.wpm)).toEqual([450]);
	});

	it("shows a test with no reading at all", async () => {
		await addSpeedTest({ readingWpm: 280, rsvpWpm: null, passageId: "canal-1" }, NOW - 5 * DAY);
		const trend = await getWpmTrend({ window: "all", mode: "reading", now: NOW });
		expect(trend.tests).toHaveLength(1);
		expect(trend.measured[trend.tests[0]?.bucketIndex ?? -1]).toBeDefined();
	});

	it("leaves out a test from before the window", async () => {
		await addSpeedTest({ readingWpm: 280, rsvpWpm: null, passageId: "canal-1" }, NOW - 60 * DAY);
		const trend = await getWpmTrend({ window: "30d", mode: "reading", now: NOW });
		expect(trend.tests).toEqual([]);
	});
});
