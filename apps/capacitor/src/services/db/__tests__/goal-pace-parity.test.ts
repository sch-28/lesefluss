// @vitest-environment node
import { BOOK_SPEED_MIN_ACTIVE_MS, bookPace, wordPos } from "@lesefluss/core";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "./test-db";

const { db, raw, close } = createTestDb();
vi.mock("../index", () => ({
	get db() {
		return db;
	},
}));
afterAll(close);

const { createGoal, getReadingGoalPlan } = await import("../queries/reading-goals");
const { getSpeedModel } = await import("../queries/stats");
const { getSettings } = await import("../queries/settings");

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const NOW = new Date(2026, 2, 10, 12).getTime();

function insertBook(id: string) {
	raw
		.prepare(
			"INSERT INTO books (id, title, file_format, size, word_position, word_count, is_active, added_at, deleted) VALUES (?,?,'epub',1,0,200000,0,0,0)",
		)
		.run(id, id);
}

let sessionSeq = 0;
function insertSitting(bookId: string, startedAt: number, minutes: number, wpm: number) {
	sessionSeq += 1;
	const durationMs = minutes * MIN;
	const words = minutes * wpm;
	raw
		.prepare(
			`INSERT INTO reading_sessions
			 (id, book_id, mode, started_at, ended_at, duration_ms, words_read, start_word, end_word, wpm_avg, updated_at)
			 VALUES (?,?,'scroll',?,?,?,?,0,?,NULL,?)`,
		)
		.run(
			`s${sessionSeq}`,
			bookId,
			startedAt,
			startedAt + durationMs,
			durationMs,
			words,
			words,
			startedAt,
		);
}

async function planAndPace(bookId: string) {
	const result = await getReadingGoalPlan(bookId, NOW);
	if (result?.plan.kind !== "plan") throw new Error("expected a plan");
	const { speedWindow } = await getSettings();
	const model = await getSpeedModel({ window: speedWindow, now: NOW });
	return { plan: result.plan.pace, pace: bookPace(model, bookId) };
}

beforeEach(async () => {
	raw.exec("DELETE FROM reading_goals; DELETE FROM books; DELETE FROM reading_sessions;");
	insertBook("other");
	insertBook("goal");
	// The global pace comes mostly from another book read much slower.
	insertSitting("other", NOW - 5 * DAY, 60, 200);
	await createGoal(
		{ id: "goal", seriesId: null, deleted: false, wordPosition: wordPos(0), wordCount: 200_000 },
		{ mode: "deadline", targetDate: "2026-04-30" },
		NOW - 4 * DAY,
	);
});

describe("goal plan and bookPace", () => {
	it("share the global pace while the book has under 30 minutes of reading", async () => {
		insertSitting("goal", NOW - 3 * DAY, 20, 400);
		expect(20 * MIN).toBeLessThan(BOOK_SPEED_MIN_ACTIVE_MS);

		const { plan, pace } = await planAndPace("goal");
		expect(plan).toEqual(pace);
		expect(plan.source).toBe("measured");
		expect(plan.wpm).toBeLessThan(400);
	});

	it("share the book's own speed once it has 30 minutes or more", async () => {
		insertSitting("goal", NOW - 3 * DAY, 20, 400);
		insertSitting("goal", NOW - 2 * DAY, 20, 400);

		const { plan, pace } = await planAndPace("goal");
		expect(plan).toEqual(pace);
		expect(plan).toEqual({ wpm: 400, source: "book" });
	});
});
