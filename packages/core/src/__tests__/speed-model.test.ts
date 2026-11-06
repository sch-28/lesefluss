import { describe, expect, it } from "vitest";
import {
	AVERAGE_READER_WPM,
	BOOK_SPEED_MIN_ACTIVE_MS,
	bookPace,
	computeSpeedModel,
	DEFAULT_RSVP_DELIVERED_RATIO,
	estimateMinutes,
	isMeasuredPace,
	modeSpeed,
	rsvpTimeSavedMs,
	type SpeedRow,
	wpmFrom,
} from "../speed-model";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const NOW = 1_800_000_000_000;

function row(overrides: Partial<SpeedRow> = {}): SpeedRow {
	return {
		bookId: "b1",
		mode: "scroll",
		startedAt: NOW - DAY,
		durationMs: 10 * MIN,
		wordsRead: 3000,
		wpmAvg: null,
		...overrides,
	};
}

describe("computeSpeedModel", () => {
	it("reports reading and RSVP apart, and pace weighted by word share", () => {
		const model = computeSpeedModel(
			[
				row({ mode: "scroll", wordsRead: 3000, durationMs: 10 * MIN }),
				row({ mode: "page", wordsRead: 2000, durationMs: 10 * MIN }),
				row({ mode: "rsvp", wordsRead: 6000, durationMs: 10 * MIN, wpmAvg: 800 }),
			],
			{ now: NOW },
		);
		expect(model.reading).toMatchObject({ wpm: 250, source: "measured" });
		expect(model.reading.scroll?.wpm).toBe(300);
		expect(model.reading.page?.wpm).toBe(200);
		expect(model.rsvp).toMatchObject({ wpm: 600, dialWpm: 800 });
		expect(model.rsvp?.deliveredRatio).toBeCloseTo(0.75, 5);
		// 11,000 words over 30 minutes, not the mean of 250 and 600.
		expect(model.pace).toEqual({ wpm: 367, source: "measured" });
		expect(model.modesUsed).toEqual({ reading: true, rsvp: true });
		expect(model.sittings).toBe(3);
	});

	it("leaves listening and position jumps out", () => {
		const model = computeSpeedModel(
			[
				row(),
				row({ mode: "listen", wordsRead: 9000 }),
				row({ wordsRead: 22_488, durationMs: 27_000 }),
				row({ wordsRead: 5, durationMs: 500 }),
			],
			{ now: NOW },
		);
		expect(model.reading.wpm).toBe(300);
		expect(model.sittings).toBe(1);
	});

	it("keeps a dial-less RSVP sitting out of the delivered ratio", () => {
		const withDial = computeSpeedModel([row({ mode: "rsvp", wordsRead: 2600, wpmAvg: 400 })], {
			now: NOW,
		});
		const withExtra = computeSpeedModel(
			[
				row({ mode: "rsvp", wordsRead: 2600, wpmAvg: 400 }),
				row({ mode: "rsvp", wordsRead: 9000, wpmAvg: null }),
			],
			{ now: NOW },
		);
		expect(withDial.rsvp?.deliveredRatio).toBeCloseTo(0.65, 5);
		expect(withExtra.rsvp?.deliveredRatio).toBe(withDial.rsvp?.deliveredRatio);
		expect(withExtra.rsvp?.wpm).toBe(Math.round(11_600 / 20));
	});

	describe("window", () => {
		// Twelve one-hour sittings, oldest at 200 wpm, newest at 400.
		const history = Array.from({ length: 12 }, (_, i) =>
			row({
				startedAt: NOW - (12 - i) * DAY,
				durationMs: HOUR,
				wordsRead: (i < 2 ? 200 : 400) * 60,
			}),
		);

		it("recent stops once the newest sittings reach ten hours", () => {
			const model = computeSpeedModel(history, { now: NOW, window: "recent" });
			expect(model.sittings).toBe(10);
			expect(model.reading.wpm).toBe(400);
		});

		it("recent still has a speed after a long break", () => {
			const old = history.map((r) => ({ ...r, startedAt: r.startedAt - 90 * DAY }));
			expect(computeSpeedModel(old, { now: NOW, window: "recent" }).reading.source).toBe(
				"measured",
			);
		});

		it("30d cuts by start date", () => {
			const model = computeSpeedModel(
				[row({ startedAt: NOW - 31 * DAY, wordsRead: 9000 }), row({ startedAt: NOW - 2 * DAY })],
				{ now: NOW, window: "30d" },
			);
			expect(model.sittings).toBe(1);
			expect(model.reading.wpm).toBe(300);
			expect(model.window).toBe("30d");
		});

		it("all takes everything", () => {
			const model = computeSpeedModel(history, { now: NOW, window: "all" });
			expect(model.sittings).toBe(12);
			expect(model.reading.wpm).toBe(Math.round((2 * 200 + 10 * 400) / 12));
		});

		it("moves pace and RSVP speed with the window", () => {
			const rows = [
				row({ startedAt: NOW - 40 * DAY, durationMs: HOUR, wordsRead: 200 * 60 }),
				row({ mode: "rsvp", startedAt: NOW - 40 * DAY, durationMs: HOUR, wordsRead: 400 * 60 }),
				row({ startedAt: NOW - 2 * DAY, durationMs: HOUR, wordsRead: 300 * 60 }),
				row({ mode: "rsvp", startedAt: NOW - 2 * DAY, durationMs: HOUR, wordsRead: 600 * 60 }),
			];
			const recent = computeSpeedModel(rows, { now: NOW, window: "recent" });
			const month = computeSpeedModel(rows, { now: NOW, window: "30d" });
			const all = computeSpeedModel(rows, { now: NOW, window: "all" });
			expect([recent.pace.wpm, recent.rsvp?.wpm]).toEqual([375, 500]);
			expect([month.pace.wpm, month.rsvp?.wpm]).toEqual([450, 600]);
			expect([all.pace.wpm, all.rsvp?.wpm]).toEqual([375, 500]);
		});

		it("borrows the reader's history when a window holds too little reading", () => {
			const rows = [
				row({ startedAt: NOW - 60 * DAY, durationMs: HOUR, wordsRead: 250 * 60 }),
				row({ mode: "rsvp", startedAt: NOW - 60 * DAY, durationMs: HOUR, wordsRead: 550 * 60 }),
			];
			const month = computeSpeedModel(rows, { now: NOW, window: "30d" });
			expect(month.sittings).toBe(0);
			expect(month.reading).toMatchObject({ wpm: 250, source: "measured" });
			expect(month.pace).toEqual({ wpm: 400, source: "measured" });
		});

		it("keeps the reading speed when recent reading was almost all RSVP", () => {
			const rows = [
				row({ startedAt: NOW - 30 * DAY, durationMs: HOUR, wordsRead: 280 * 60 }),
				...Array.from({ length: 10 }, (_, i) =>
					row({ mode: "rsvp", startedAt: NOW - i * DAY, durationMs: HOUR, wordsRead: 500 * 60 }),
				),
			];
			const recent = computeSpeedModel(rows, {
				now: NOW,
				window: "recent",
				speedTest: { wpm: 180, takenAt: NOW - DAY },
			});
			expect(recent.reading.scroll).toBeNull();
			expect(recent.reading).toMatchObject({ wpm: 280, source: "measured" });
			expect(recent.pace).toEqual({ wpm: 500, source: "measured" });
		});
	});

	describe("fallback", () => {
		it("is 225 with nothing measured", () => {
			const model = computeSpeedModel([], { now: NOW });
			expect(model.reading).toMatchObject({ wpm: AVERAGE_READER_WPM, source: "default" });
			expect(model.pace).toEqual({ wpm: AVERAGE_READER_WPM, source: "default" });
			expect(model.rsvp).toBeNull();
			expect(model.modesUsed).toEqual({ reading: false, rsvp: false });
		});

		it("prefers a speed test to the default", () => {
			const model = computeSpeedModel([], {
				now: NOW,
				speedTest: { wpm: 310, takenAt: NOW - DAY },
			});
			expect(model.reading).toMatchObject({ wpm: 310, source: "test" });
			expect(model.pace).toEqual({ wpm: 310, source: "test" });
		});

		it("does not let a few minutes of reading set the speed", () => {
			const model = computeSpeedModel([row({ durationMs: 9 * MIN, wordsRead: 9000 })], {
				now: NOW,
			});
			expect(model.reading.source).toBe("default");
			expect(model.pace.source).toBe("default");
			// The raw figure is still there for anything that wants to show it.
			expect(model.reading.scroll?.wpm).toBe(1000);
		});
	});
});

describe("bookPace", () => {
	const global = row({ bookId: "other", durationMs: HOUR, wordsRead: 300 * 60 });

	it("uses the book's own speed from 30 minutes on it", () => {
		const model = computeSpeedModel(
			[global, row({ durationMs: BOOK_SPEED_MIN_ACTIVE_MS + MIN, wordsRead: 31 * 150 })],
			{ now: NOW },
		);
		expect(bookPace(model, "b1")).toEqual({ wpm: 150, source: "book" });
	});

	it("uses the global pace below 30 minutes", () => {
		const model = computeSpeedModel([global, row({ durationMs: 29 * MIN, wordsRead: 29 * 150 })], {
			now: NOW,
		});
		expect(bookPace(model, "b1")).toEqual(model.pace);
		expect(model.books.b1?.wpm).toBe(150);
	});

	it("counts a book's sittings outside the window", () => {
		const recentOther = Array.from({ length: 11 }, (_, i) =>
			row({ bookId: "other", startedAt: NOW - i * HOUR, durationMs: HOUR, wordsRead: 300 * 60 }),
		);
		const model = computeSpeedModel(
			[...recentOther, row({ startedAt: NOW - 200 * DAY, durationMs: HOUR, wordsRead: 9000 })],
			{ now: NOW, window: "recent" },
		);
		expect(bookPace(model, "b1")).toEqual({ wpm: 150, source: "book" });
	});

	it("falls back to the default without a model", () => {
		expect(bookPace(undefined, "b1")).toEqual({ wpm: AVERAGE_READER_WPM, source: "default" });
		expect(isMeasuredPace(bookPace(undefined, "b1"))).toBe(false);
	});
});

describe("modeSpeed", () => {
	it("scales the dial by the delivered ratio", () => {
		const model = computeSpeedModel([row({ mode: "rsvp", wordsRead: 3000, wpmAvg: 400 })], {
			now: NOW,
		});
		expect(modeSpeed(model, "rsvp", 500)).toBe(375);
	});

	it("uses the default ratio without enough RSVP reading", () => {
		const model = computeSpeedModel([], { now: NOW });
		expect(modeSpeed(model, "rsvp", 400)).toBe(Math.round(400 * DEFAULT_RSVP_DELIVERED_RATIO));
		expect(modeSpeed(undefined, "rsvp", 400)).toBe(Math.round(400 * DEFAULT_RSVP_DELIVERED_RATIO));
	});

	it("uses the mode's own speed, else the reading speed", () => {
		const model = computeSpeedModel(
			[
				row({ mode: "scroll", durationMs: 20 * MIN, wordsRead: 6000 }),
				row({ mode: "page", durationMs: 2 * MIN, wordsRead: 100 }),
			],
			{ now: NOW },
		);
		expect(modeSpeed(model, "scroll", 400)).toBe(300);
		expect(modeSpeed(model, "page", 400)).toBe(model.reading.wpm);
		expect(modeSpeed(undefined, "page", 400)).toBe(AVERAGE_READER_WPM);
	});
});

describe("helpers", () => {
	it("wpmFrom is null without time or words", () => {
		expect(wpmFrom(0, MIN)).toBeNull();
		expect(wpmFrom(100, 0)).toBeNull();
		expect(wpmFrom(1, HOUR)).toBe(1);
	});

	it("estimateMinutes never divides by zero", () => {
		expect(estimateMinutes(600, 300)).toBe(2);
		expect(estimateMinutes(600, 0)).toBe(600);
	});

	it("time saved is never negative", () => {
		expect(rsvpTimeSavedMs(6000, 200, 400)).toBe(15 * MIN);
		expect(rsvpTimeSavedMs(6000, 400, 200)).toBe(0);
		expect(rsvpTimeSavedMs(6000, 0, 400)).toBe(0);
	});
});
