import { describe, expect, it } from "vitest";
import {
	BROWSE_MOVE_DISTANCE_WORDS,
	BROWSE_RESUME_MS,
	BROWSE_STREAK_IDLE_CAP_MS,
	createLongMoveDetector,
	createReadingResumeDetector,
} from "../browse-detector";

const WORDS_PER_MS_AT_800_WPM = 800 / 60_000;

/** Feeds consecutive settles; returns the first anchor reported, else null. */
function feed(
	d: ReturnType<typeof createLongMoveDetector>,
	settles: { word: number; t: number }[],
	from: number,
): number | null {
	let prev = from;
	for (const s of settles) {
		const anchor = d.record(prev, s.word, s.t);
		if (anchor !== null) return anchor;
		prev = s.word;
	}
	return null;
}

function readingAt(wordsPerMs: number, start: number, stepMs: number, steps: number) {
	return Array.from({ length: steps }, (_, i) => ({
		word: Math.round(start + (i + 1) * stepMs * wordsPerMs),
		t: (i + 1) * stepMs,
	}));
}

describe("createLongMoveDetector", () => {
	it("never triggers on scroll reading at 800 WPM with frequent small settles", () => {
		const d = createLongMoveDetector();
		expect(feed(d, readingAt(WORDS_PER_MS_AT_800_WPM, 0, 3_000, 2_000), 0)).toBeNull();
	});

	it("never triggers on page turns of 1200-word pages at 800 WPM", () => {
		const d = createLongMoveDetector();
		expect(feed(d, readingAt(WORDS_PER_MS_AT_800_WPM, 0, 90_000, 200), 0)).toBeNull();
	});

	it("triggers on a fling after reading and anchors where reading stopped", () => {
		const d = createLongMoveDetector();
		const reading = readingAt(WORDS_PER_MS_AT_800_WPM, 0, 5_000, 60);
		const stoppedAt = reading[reading.length - 1];
		const flings = [1, 2, 3].map((n) => ({
			word: stoppedAt.word + n * 700,
			t: stoppedAt.t + n * 1_500,
		}));
		expect(feed(d, [...reading, ...flings], 0)).toBe(stoppedAt.word);
	});

	it("triggers on a fast backward move", () => {
		const d = createLongMoveDetector();
		expect(d.record(10_000, 10_000 - BROWSE_MOVE_DISTANCE_WORDS, 61_000)).toBe(10_000);
	});

	it("anchors a fling straight after a chain break at the break, not ahead of it", () => {
		const d = createLongMoveDetector();
		expect(d.record(0, 900, 1_000)).toBeNull();
		expect(d.record(900, 1_800, 1_400)).toBeNull();
		expect(d.record(1_800, 2_700, 1_800)).toBe(0);
	});

	it("does not trigger when fast steps are broken up by reading", () => {
		const d = createLongMoveDetector();
		const settles = [
			{ word: 1_500, t: 1_000 },
			{ word: 1_600, t: 61_000 },
			{ word: 3_000, t: 62_000 },
		];
		expect(feed(d, settles, 0)).toBeNull();
	});

	it("starts a new chain when the position moved outside the settles", () => {
		const d = createLongMoveDetector();
		expect(d.record(0, 500, 1_000)).toBeNull();
		// RSVP (or a device sync) carried the reader to 4000; a small scroll follows.
		expect(d.record(4_000, 4_300, 2_000)).toBeNull();
	});

	it("reset forgets a fast run in progress", () => {
		const d = createLongMoveDetector();
		expect(d.record(0, 1_500, 1_000)).toBeNull();
		d.reset();
		expect(d.record(1_500, 2_500, 2_000)).toBeNull();
	});
});

describe("createReadingResumeDetector", () => {
	const WPM_250 = 250 / 60_000;

	/** Feeds settles the way the controller does after entering browse: the
	 *  first one lands from the jump target, which breaks the chain. */
	function feedResume(
		d: ReturnType<typeof createReadingResumeDetector>,
		jumpTarget: number,
		settles: { word: number; t: number }[],
	) {
		let prev = jumpTarget;
		for (const s of settles) {
			const streak = d.record(prev, s.word, s.t);
			if (streak) return { at: s.t, streak };
			prev = s.word;
		}
		return null;
	}

	it("resumes once reading has held for the resume time after the first settle", () => {
		const d = createReadingResumeDetector();
		const settles = readingAt(WPM_250, 5_000, 30_000, 10);
		const first = settles[0];
		const resumed = feedResume(d, 4_000, settles);
		expect(resumed?.at).toBe(first.t + BROWSE_RESUME_MS);
		expect(resumed?.streak).toEqual({ from: first.word, activeMs: BROWSE_RESUME_MS });
	});

	it("does not resume before the resume time, however many settles", () => {
		const d = createReadingResumeDetector();
		const settles = Array.from({ length: 20 }, (_, i) => ({ word: 5_000 + i * 20, t: i * 2_000 }));
		expect(feedResume(d, 4_000, settles)).toBeNull();
	});

	it("a fast move restarts the wait", () => {
		const d = createReadingResumeDetector();
		const resumed = feedResume(d, 4_000, [
			{ word: 5_000, t: 0 },
			{ word: 5_100, t: 60_000 },
			{ word: 9_000, t: 61_000 },
			{ word: 9_100, t: 121_000 },
			{ word: 9_200, t: 150_000 },
			{ word: 9_300, t: 181_000 },
		]);
		expect(resumed).toEqual({ at: 181_000, streak: { from: 9_000, activeMs: 120_000 } });
	});

	it("a position change outside the settles restarts the wait", () => {
		const d = createReadingResumeDetector();
		d.record(4_000, 5_000, 0);
		d.record(5_000, 5_100, 50_000);
		d.record(5_100, 5_200, 100_000);
		// A jump moved the reader to 20000 before this settle.
		expect(d.record(20_000, 20_050, 130_000)).toBeNull();
	});

	it("an idle gap can't pass off a big step as reading, and only counts up to the cap", () => {
		const d = createReadingResumeDetector();
		d.record(4_000, 5_000, 0);
		// 10 minutes idle, then a 3000-word fling: a jump, not reading.
		expect(d.record(5_000, 8_000, 10 * 60_000)).toBeNull();
		const idleStreak = createReadingResumeDetector();
		idleStreak.record(4_000, 5_000, 0);
		idleStreak.record(5_000, 5_100, 10 * 60_000);
		idleStreak.record(5_100, 5_200, 10 * 60_000 + 30_000);
		expect(idleStreak.record(5_200, 5_300, 10 * 60_000 + 60_000)).toEqual({
			from: 5_000,
			activeMs: BROWSE_STREAK_IDLE_CAP_MS + 60_000,
		});
	});

	it("reports whole milliseconds for fractional clocks", () => {
		const d = createReadingResumeDetector();
		const resumed = feedResume(d, 4_000, [
			{ word: 5_000, t: 0.4 },
			{ word: 5_100, t: 40_000.7 },
			{ word: 5_200, t: 80_000.2 },
			{ word: 5_300, t: 120_000.9 },
		]);
		expect(Number.isInteger(resumed?.streak.activeMs)).toBe(true);
	});

	it("reset forgets the streak", () => {
		const d = createReadingResumeDetector();
		d.record(4_000, 5_000, 0);
		d.record(5_000, 5_100, 50_000);
		d.record(5_100, 5_200, 100_000);
		d.reset();
		expect(d.record(5_200, 5_300, 130_000)).toBeNull();
	});
});
