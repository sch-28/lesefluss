import { describe, expect, it } from "vitest";
import {
	BUDDY_TRAILER_LAST_TICK,
	BUDDY_TRAILER_MIN_GAP,
	buddyTrailerCaptionAt,
	buddyTrailerPositions,
} from "../buddy-trailer";

describe("buddyTrailerPositions", () => {
	it("keeps everyone clear of each other on every tick, wherever You are", () => {
		for (let self = 0; self <= 100; self++) {
			for (let tick = 0; tick <= BUDDY_TRAILER_LAST_TICK; tick++) {
				const positions = buddyTrailerPositions(self, tick);
				expect(positions.readers).toHaveLength(3);
				const riders = [positions.self, ...positions.readers]
					.map((r) => r.percent)
					.sort((a, b) => a - b);
				expect(riders[0]).toBeGreaterThanOrEqual(0);
				expect(riders[riders.length - 1]).toBeLessThanOrEqual(100);
				for (let i = 1; i < riders.length; i++) {
					expect(riders[i] - riders[i - 1]).toBeGreaterThanOrEqual(BUDDY_TRAILER_MIN_GAP);
				}
			}
			expect(buddyTrailerPositions(self, BUDDY_TRAILER_LAST_TICK).self.percent).toBe(self);
		}
	});

	it("moves each reader on its own ticks", () => {
		const stepsAt = (tick: number) => {
			const positions = buddyTrailerPositions(50, tick);
			return [...positions.readers.map((r) => r.steps), positions.self.steps];
		};
		// Ali, Mia, Jo, You
		expect(stepsAt(0)).toEqual([1, 0, 1, 0]);
		expect(stepsAt(1)).toEqual([1, 1, 1, 1]);
		expect(stepsAt(2)).toEqual([2, 1, 1, 2]);
		expect(stepsAt(3)).toEqual([2, 2, 2, 2]);
		expect(stepsAt(BUDDY_TRAILER_LAST_TICK)).toEqual([8, 8, 8, 8]);

		const start = buddyTrailerPositions(50, 0).readers;
		const end = buddyTrailerPositions(50, BUDDY_TRAILER_LAST_TICK).readers;
		for (const [i, r] of end.entries()) {
			expect(r.percent - (start[i]?.percent ?? 0)).toBeGreaterThanOrEqual(12);
		}
	});
});

describe("buddyTrailerCaptionAt", () => {
	it("starts and ends on the framing captions", () => {
		expect(buddyTrailerCaptionAt(0)).toBe("Everyone reads their own copy");
		expect(buddyTrailerCaptionAt(BUDDY_TRAILER_LAST_TICK)).toBe("See where everyone is, live");
	});
});
