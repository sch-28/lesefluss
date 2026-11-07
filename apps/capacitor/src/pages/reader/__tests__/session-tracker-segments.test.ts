import { describe, expect, it } from "vitest";
import { SEGMENT_MS, type SessionRow } from "../../../services/reading-sessions/rules";
import { POLL_MS, SessionTracker, segmentRates } from "../session-tracker";

const MIN = 60_000;

function setup(fontSize: number | null = 18) {
	let clock = 1_000_000;
	let position = 0;
	let size = fontSize;
	const persisted: SessionRow[] = [];
	const tracker = new SessionTracker({
		bookId: "book1",
		mode: "scroll",
		getPosition: () => position,
		getWpmSetting: () => null,
		getFontSize: () => size,
		persist: (row) => persisted.push(row),
		now: () => clock,
		newId: () => "id1",
	});
	return {
		tracker,
		persisted,
		last: () => persisted[persisted.length - 1],
		setFontSize(value: number | null) {
			size = value;
		},
		/** Reads at `wpm` for `ms` in POLL_MS ticks. */
		read(ms: number, wpm: number) {
			for (let t = 0; t < ms; t += POLL_MS) {
				clock += POLL_MS;
				position += (wpm * POLL_MS) / MIN;
				tracker.tick();
			}
		},
		get position() {
			return position;
		},
	};
}

describe("SessionTracker font size", () => {
	it("records the font size the sitting ended at", () => {
		const env = setup(16);
		env.tracker.setReading(true);
		env.read(MIN, 240);
		env.setFontSize(20);
		env.read(MIN, 240);
		env.tracker.finalize();
		expect(env.last()?.fontSize).toBe(20);
	});

	it("records null without a font size", () => {
		const env = setup(null);
		env.tracker.setReading(true);
		env.read(2 * MIN, 240);
		env.tracker.finalize();
		expect(env.last()?.fontSize).toBeNull();
	});
});

describe("SessionTracker segments", () => {
	it("leaves segmentWpm null before a full segment", () => {
		const env = setup();
		env.tracker.setReading(true);
		env.read(SEGMENT_MS - POLL_MS, 240);
		env.tracker.finalize();
		expect(env.last()?.segmentWpm).toBeNull();
	});

	it("records the wpm of each full segment and drops the partial one", () => {
		const env = setup();
		env.tracker.setReading(true);
		env.read(SEGMENT_MS, 240);
		env.read(SEGMENT_MS, 240);
		env.read(SEGMENT_MS, 180);
		env.read(5 * MIN, 120);
		env.tracker.finalize();
		const rates = env.last()?.segmentWpm ?? [];
		expect(rates).toHaveLength(3);
		// The first segment starts on an empty credit budget, so it may trail by a burst.
		expect(rates[0]).toBeGreaterThan(220);
		expect(rates[1]).toBeCloseTo(240, -1);
		expect(rates[2]).toBeCloseTo(180, -1);
	});

	it("does not count idle time toward a segment", () => {
		const env = setup();
		env.tracker.setReading(true);
		env.read(SEGMENT_MS - MIN, 240);
		// Idle past the soft pause: the clock moves, the position does not.
		env.read(4 * MIN, 0);
		env.tracker.finalize();
		expect(env.last()?.segmentWpm).toBeNull();
	});

	it("clamps segments when reading is rewound", () => {
		const env = setup();
		env.tracker.setReading(true);
		env.read(SEGMENT_MS + MIN, 240);
		env.tracker.rewindTo(100);
		env.tracker.finalize();
		const rates = env.last()?.segmentWpm ?? [];
		expect(rates).toHaveLength(1);
		expect(rates[0]).toBeLessThanOrEqual(10);
	});

	it("shares a backfilled span evenly across its segments", () => {
		const env = setup();
		env.tracker.backfill({ from: 0, to: 4800, activeMs: 2 * SEGMENT_MS });
		env.tracker.finalize();
		expect(env.last()?.segmentWpm).toEqual([240, 240]);
	});
});

describe("segmentRates", () => {
	it("turns cumulative marks into per-segment wpm", () => {
		expect(segmentRates([])).toBeNull();
		expect(segmentRates([2400, 4600, 6400])).toEqual([240, 220, 180]);
	});
});
