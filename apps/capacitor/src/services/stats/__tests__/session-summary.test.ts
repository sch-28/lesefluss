import { computeSpeedModel, wordPos } from "@lesefluss/core";
import { describe, expect, it } from "vitest";
import type { SessionRow } from "../../reading-sessions/rules";
import { summarize, todayMinutes } from "../session-summary";

const MIN = 60_000;
const NOW = 1_800_000_000_000;

function row(overrides: Partial<SessionRow> = {}): SessionRow {
	return {
		id: "s1",
		bookId: "b1",
		mode: "scroll",
		startedAt: NOW - 60 * MIN,
		endedAt: NOW - 30 * MIN,
		durationMs: 30 * MIN,
		wordsRead: 30 * 260,
		startWord: wordPos(4000),
		endWord: wordPos(4000 + 30 * 260),
		furthestWord: wordPos(4000 + 30 * 260),
		wpmAvg: 260,
		updatedAt: NOW,
		...overrides,
	};
}

const history = computeSpeedModel(
	[
		{
			bookId: "b0",
			mode: "scroll",
			startedAt: NOW - 86_400_000,
			durationMs: 60 * MIN,
			wordsRead: 60 * 250,
			wpmAvg: 250,
		},
		{
			bookId: "b0",
			mode: "rsvp",
			startedAt: NOW - 86_400_000,
			durationMs: 60 * MIN,
			wordsRead: 60 * 400,
			wpmAvg: 450,
		},
	],
	{ now: NOW, window: "all" },
);

describe("summarize", () => {
	it("compares a reading sitting with the reading average", () => {
		const stats = summarize([row()], 100_000, history);
		expect(stats).toMatchObject({
			isRsvp: false,
			activeMs: 30 * MIN,
			words: 7800,
			wpm: 260,
			deltaWpm: 10,
			fromPercent: 4,
			rsvp: null,
		});
		expect(stats.toPercent).toBeCloseTo(11.8);
	});

	it("shows RSVP's own speed and the time it saved", () => {
		const stats = summarize(
			[row({ mode: "rsvp", wordsRead: 30 * 500, wpmAvg: 500 })],
			100_000,
			history,
		);
		expect(stats.isRsvp).toBe(true);
		expect(stats.wpm).toBe(500);
		expect(stats.deltaWpm).toBe(100);
		// 15000 words: 60 min at 250 wpm, 30 at 500.
		expect(stats.rsvp).toMatchObject({ savedMs: 30 * MIN, rsvpMs: 30 * MIN, baselineMs: 60 * MIN });
	});

	it("names the mode read longest in a mixed visit and spans the book from first to last", () => {
		const stats = summarize(
			[
				row({
					durationMs: 10 * MIN,
					wordsRead: 2500,
					startWord: wordPos(1000),
					endWord: wordPos(3500),
				}),
				row({
					id: "s2",
					mode: "rsvp",
					durationMs: 20 * MIN,
					wordsRead: 8000,
					startWord: wordPos(3500),
					endWord: wordPos(11_500),
				}),
			],
			100_000,
			history,
		);
		expect(stats.isRsvp).toBe(true);
		expect(stats.wpm).toBe(400);
		expect(stats.words).toBe(10_500);
		expect([stats.fromPercent, stats.toPercent]).toEqual([1, 11.5]);
	});

	it("leaves out what it cannot know", () => {
		const stats = summarize([row({ mode: "rsvp", wordsRead: 30 * 500 })], 0, undefined);
		expect(stats).toMatchObject({ deltaWpm: null, fromPercent: null, toPercent: null, rsvp: null });
	});
});

describe("todayMinutes", () => {
	it("splits today into earlier reading and this sitting", () => {
		expect(todayMinutes(52 * MIN, 34 * MIN)).toEqual({ earlier: 18, total: 52 });
	});

	it("counts the sitting before its write reaches today's totals", () => {
		expect(todayMinutes(10 * MIN, 34 * MIN)).toEqual({ earlier: 0, total: 34 });
	});
});
