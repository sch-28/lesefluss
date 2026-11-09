import { computeSpeedModel, type SpeedRow } from "@lesefluss/core";
import { describe, expect, it } from "vitest";
import { summariseRecords } from "../records";
import {
	buildSpeedTabData,
	deltaLabel,
	modeAverage,
	percentVsAverage,
	SPEED_DELTA_SPAN_MS,
	type SpeedTabSession,
	sortBookRows,
	speedDelta,
	speedViews,
	timeSavedMs,
} from "../speed-tab";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const NOW = 1_800_000_000_000;

function sitting(overrides: Partial<SpeedTabSession> = {}): SpeedTabSession {
	return {
		bookId: "b1",
		mode: "scroll",
		startedAt: NOW - DAY,
		durationMs: HOUR,
		wordsRead: 250 * 60,
		wpmAvg: null,
		...overrides,
	};
}

const model = (rows: SpeedRow[]) => computeSpeedModel(rows, { now: NOW, window: "all" });

describe("speedViews", () => {
	it("shows only reading to a reader who never used RSVP", () => {
		expect(speedViews(model([sitting()]))).toEqual(["reading"]);
	});

	it("shows only RSVP to a reader who never read otherwise", () => {
		expect(speedViews(model([sitting({ mode: "rsvp", wpmAvg: 400 })]))).toEqual(["rsvp"]);
	});

	it("shows both when both were used", () => {
		expect(speedViews(model([sitting(), sitting({ mode: "rsvp", wpmAvg: 400 })]))).toEqual([
			"reading",
			"rsvp",
		]);
	});

	it("still shows reading with no sittings at all", () => {
		expect(speedViews(model([]))).toEqual(["reading"]);
	});
});

describe("timeSavedMs", () => {
	const rsvp = sitting({ mode: "rsvp", wordsRead: 400 * 60, wpmAvg: 450 });

	it("counts the time RSVP saved over the reader's own speed", () => {
		// 24000 words: 96 min at 250 wpm, 60 min at 400.
		expect(timeSavedMs(model([sitting(), rsvp]))).toBe(36 * MIN);
	});

	it("is hidden without a reading baseline", () => {
		expect(timeSavedMs(model([rsvp]))).toBe(0);
	});

	it("is hidden when RSVP is slower than reading", () => {
		const slow = sitting({ mode: "rsvp", wordsRead: 200 * 60, wpmAvg: 250 });
		expect(timeSavedMs(model([sitting(), slow]))).toBe(0);
	});

	it("is hidden with no RSVP", () => {
		expect(timeSavedMs(model([sitting()]))).toBe(0);
	});
});

describe("speedDelta", () => {
	const recent = (wpm: number, at: number, mode: SpeedTabSession["mode"] = "scroll") =>
		sitting({ startedAt: at, wordsRead: wpm * 60, mode });
	const asOf = NOW - SPEED_DELTA_SPAN_MS;
	const recentModel = (rows: SpeedRow[], now: number) =>
		computeSpeedModel(
			rows.filter((r) => r.startedAt < now),
			{ now, window: "recent" },
		);

	it("compares the headline with the same window's speed four weeks earlier", () => {
		const rows = [recent(200, asOf - 2 * DAY), recent(260, NOW - DAY)];
		const current = recentModel(rows, NOW);
		const earlier = recentModel(rows, asOf);
		expect(current.reading.wpm).toBe(230);
		expect(earlier.reading.wpm).toBe(200);
		expect(speedDelta(current, earlier, "reading")).toBe(30);
	});

	it("is absent when either side is not measured reading", () => {
		const current = recentModel([recent(260, NOW - DAY)], NOW);
		expect(speedDelta(current, recentModel([], asOf), "reading")).toBeNull();
		expect(speedDelta(current, undefined, "reading")).toBeNull();
		const tested = computeSpeedModel([], {
			now: NOW,
			window: "recent",
			speedTest: { wpm: 300, takenAt: NOW - DAY },
		});
		expect(speedDelta(tested, current, "reading")).toBeNull();
		expect(speedDelta(current, current, "rsvp")).toBeNull();
	});

	it("labels the span it covers", () => {
		expect(deltaLabel(12)).toBe("+12 in 4 weeks");
		expect(deltaLabel(-5)).toBe("−5 in 4 weeks");
		expect(deltaLabel(0)).toBe("±0 in 4 weeks");
	});
});

describe("buildSpeedTabData", () => {
	const titles = new Map([
		["b1", { title: "Scrolled", coverImage: null }],
		["b2", { title: "Flashed", coverImage: "data:x" }],
		["b3", { title: "Short", coverImage: null }],
	]);

	it("lists books with enough reading, each with its main mode and RSVP dial", () => {
		const data = buildSpeedTabData(
			[
				sitting({ bookId: "b1" }),
				sitting({ bookId: "b2", mode: "rsvp", wordsRead: 400 * 60, wpmAvg: 500 }),
				sitting({ bookId: "b3", durationMs: 10 * MIN, wordsRead: 2500 }),
			],
			titles,
		);
		expect(data.books.map((b) => [b.bookId, b.mode, b.dialWpm])).toEqual([
			["b1", "scroll", null],
			["b2", "rsvp", 500],
		]);
	});

	it("leaves out a deleted book and an implausible sitting", () => {
		const data = buildSpeedTabData(
			[sitting({ bookId: "gone" }), sitting({ wordsRead: 5_000_000 })],
			titles,
		);
		expect(data.books).toEqual([]);
		expect(data.records.fastestSitting).toBeNull();
	});

	it("keeps reading and RSVP records apart", () => {
		const data = buildSpeedTabData(
			[
				sitting({ startedAt: NOW - 3 * DAY, wordsRead: 300 * 60 }),
				sitting({ startedAt: NOW - 2 * DAY }),
				sitting({ bookId: "b2", mode: "rsvp", wordsRead: 420 * 60, wpmAvg: 450 }),
				sitting({ bookId: "b2", mode: "rsvp", durationMs: 2 * HOUR, wordsRead: 380 * 120 }),
				// Too short to hold a record, however fast.
				sitting({ bookId: "b3", durationMs: 2 * MIN, wordsRead: 1200 }),
			],
			titles,
		);
		expect(data.records.fastestSitting).toMatchObject({ wpm: 300, title: "Scrolled" });
		expect(data.records.bestRsvpSitting).toMatchObject({ wpm: 420, title: "Flashed" });
		expect(data.records.longestRsvpRun?.durationMs).toBe(2 * HOUR);
		// 70800 words in 3 h: an RSVP book holds the record too, as on the Overview.
		expect(data.records.fastestBook).toEqual({ wpm: 393, title: "Flashed" });
	});

	it("crowns the same fastest book as the Overview", () => {
		const sessions = [
			sitting({ bookId: "b1" }),
			sitting({ bookId: "b2", mode: "rsvp", durationMs: 15 * MIN, wordsRead: 400 * 15 }),
			sitting({ bookId: "b3", durationMs: 5 * MIN, wordsRead: 600 * 5 }),
		];
		const overview = summariseRecords(
			sessions,
			[...titles].map(([id, { title }]) => ({
				id,
				title,
				wordCount: 1,
				finishedAt: null,
				seriesId: null,
			})),
		);
		const tab = buildSpeedTabData(sessions, titles);
		// 15 min of RSVP is past the record's 10 min, short of the book list's 30.
		expect(tab.records.fastestBook).toEqual({ wpm: 400, title: "Flashed" });
		expect(tab.records.fastestBook).toEqual(overview.fastestBook);
	});
});

describe("book comparison", () => {
	const m = model([
		sitting({ wordsRead: 200 * 60 }),
		sitting({ mode: "page", wordsRead: 300 * 60 }),
		sitting({ mode: "rsvp", wordsRead: 400 * 60, wpmAvg: 450 }),
	]);

	it("compares a book with its own mode's average", () => {
		expect(modeAverage(m, "scroll")).toBe(200);
		expect(modeAverage(m, "page")).toBe(300);
		expect(modeAverage(m, "rsvp")).toBe(400);
		expect(percentVsAverage(220, 200)).toBe(10);
		expect(percentVsAverage(220, null)).toBeNull();
	});

	it("has no average to compare with when the speed is only the stand-in", () => {
		expect(modeAverage(model([]), "scroll")).toBeNull();
	});

	it("sorts by speed, by distance over the average and by last read", () => {
		const row = (bookId: string, mode: "scroll" | "rsvp", wpm: number, lastAt: number) => ({
			bookId,
			title: bookId,
			author: null,
			coverImage: null,
			mode,
			wpm,
			activeMs: HOUR,
			dialWpm: null,
			lastAt,
		});
		const rows = [row("a", "scroll", 240, 3), row("b", "rsvp", 380, 1), row("c", "scroll", 190, 2)];
		expect(sortBookRows(rows, "wpm", m).map((r) => r.bookId)).toEqual(["b", "a", "c"]);
		expect(sortBookRows(rows, "delta", m).map((r) => r.bookId)).toEqual(["a", "b", "c"]);
		expect(sortBookRows(rows, "recent", m).map((r) => r.bookId)).toEqual(["a", "c", "b"]);
	});
});
