/**
 * Property test for words-read accounting. The example-based tests next door
 * missed two whole classes of error (a peek-ahead suppressing all later credit,
 * and re-entering a skipped gap), so this compares the tracker against an
 * independent reference over random tick sequences instead.
 */
import { describe, expect, it } from "vitest";
import {
	POLL_MS,
	POLL_THROTTLE_GUARD_MS,
	type SessionRow,
	SessionTracker,
} from "../session-tracker";

const SCROLL_JUMP_THRESHOLD = 400;
const SEQUENCES = 200_000;

/** Mirrors the tracker's stated policy, not its implementation: no sitting may
 *  be credited faster than a person reads. */
const CREDIT_CEILING_WPM = 800;

/** Movement per tick that stays under the credit ceiling, so the union model
 *  below is exact rather than an upper bound. */
const READABLE_WORDS_PER_TICK = 60;

const LEAD_IN_MS = 20_000;

/** Words read = the union of every forward move made at reading pace. */
function expectedWordsRead(positions: number[]): number {
	const spans: Array<[number, number]> = [];
	for (let i = 1; i < positions.length; i++) {
		const from = positions[i - 1] as number;
		const to = positions[i] as number;
		if (to > from && to - from < SCROLL_JUMP_THRESHOLD) spans.push([from, to]);
	}
	spans.sort((a, b) => a[0] - b[0]);

	let total = 0;
	let start = Number.NEGATIVE_INFINITY;
	let end = Number.NEGATIVE_INFINITY;
	for (const [spanStart, spanEnd] of spans) {
		if (spanStart > end) {
			if (end > start) total += end - start;
			start = spanStart;
			end = spanEnd;
		} else if (spanEnd > end) {
			end = spanEnd;
		}
	}
	if (end > start) total += end - start;
	return total;
}

/**
 * The most the budget can hand out over a run of this length.
 *
 * No burst allowance on top: the bucket starts empty, so the burst capacity only
 * caps what an idle stretch may bank, it never adds to the total refilled. Adding
 * it would leave the bound slack by 500 words, which is a leak this property is
 * meant to catch.
 */
function creditableWords(tickCount: number): number {
	const elapsedMs = Math.min(LEAD_IN_MS, POLL_THROTTLE_GUARD_MS) + (tickCount - 1) * POLL_MS;
	return (CREDIT_CEILING_WPM * elapsedMs) / 60_000;
}

function actualWordsRead(positions: number[]): number {
	let clock = 1_000_000;
	let index = 0;
	const persisted: SessionRow[] = [];
	const tracker = new SessionTracker({
		bookId: "book1",
		mode: "scroll",
		getPosition: () => positions[index] as number,
		getWpmSetting: () => 250,
		persist: (row) => persisted.push(row),
		now: () => clock,
		newId: () => "id1",
	});

	tracker.setReading(true);
	clock += LEAD_IN_MS;
	for (index = 1; index < positions.length; index++) {
		clock += POLL_MS;
		tracker.tick();
	}
	tracker.finalize();
	return persisted.at(-1)?.wordsRead ?? 0;
}

/**
 * Deterministic LCG so a failure is reproducible from the seed alone.
 *
 * `Math.imul` rather than `*`: the product of a 31-bit state and the multiplier
 * exceeds 2^53, so plain multiplication drops the low bits that the mask then
 * keeps. That collapsed the generator to a ~10k cycle and 895 distinct
 * sequences, whatever SEQUENCES was set to.
 */
function seededRandom(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (Math.imul(state, 1103515245) + 12345) >>> 0;
		return state / 0x1_0000_0000;
	};
}

function randomPositions(random: () => number, maxForwardStep: number): number[] {
	const positions = [0];
	const length = 3 + Math.floor(random() * 14);
	for (let i = 1; i < length; i++) {
		const previous = positions[i - 1] as number;
		const roll = random();
		if (roll < 0.55) positions.push(previous + Math.floor(random() * maxForwardStep));
		else if (roll < 0.7)
			positions.push(Math.max(0, previous - Math.floor(random() * (SCROLL_JUMP_THRESHOLD - 1))));
		else {
			// A teleport must not land in the band between "readable" and "jump":
			// that is a forward move the budget throttles but the union model
			// counts in full, which is the second property's business, not this one.
			const target = Math.floor(random() * 50_000);
			const delta = target - previous;
			positions.push(
				delta > maxForwardStep && delta < SCROLL_JUMP_THRESHOLD
					? previous + SCROLL_JUMP_THRESHOLD + Math.floor(random() * 1000)
					: target,
			);
		}
	}
	return positions;
}

describe("SessionTracker words-read accounting", () => {
	it("matches the union of forward reading moves over random sequences", () => {
		const random = seededRandom(12_345);
		const mismatches: Array<{ positions: number[]; expected: number; actual: number }> = [];

		for (let i = 0; i < SEQUENCES; i++) {
			const positions = randomPositions(random, READABLE_WORDS_PER_TICK);
			const expected = expectedWordsRead(positions);
			// Below the noise floor the tracker deliberately drops the row.
			if (expected < 5) continue;
			const actual = actualWordsRead(positions);
			if (actual !== expected && mismatches.length < 5) {
				mismatches.push({ positions, expected, actual });
			}
		}

		expect(mismatches).toEqual([]);
	});

	// The generator here moves fast enough to outrun any reader, which is the
	// case the union model cannot describe: crediting is throttled, so the union
	// becomes an upper bound rather than the answer.
	it("never credits faster than a person can read, however fast the position moves", () => {
		const random = seededRandom(9_876);
		const violations: Array<{ positions: number[]; actual: number; limit: number }> = [];

		for (let i = 0; i < SEQUENCES; i++) {
			const positions = randomPositions(random, SCROLL_JUMP_THRESHOLD - 1);
			const actual = actualWordsRead(positions);
			const union = expectedWordsRead(positions);
			const limit = creditableWords(positions.length - 1);
			if ((actual > limit || actual > union) && violations.length < 5) {
				violations.push({ positions, actual, limit });
			}
		}

		expect(violations).toEqual([]);
	});

	it("throttles a sustained fling well below the ground it covers", () => {
		// 399 words per 5s tick is 4,788 wpm: under the jump threshold, far over
		// any reading pace. This is the preface-skip that used to count in full.
		const positions = [0];
		for (let i = 1; i <= 14; i++) positions.push(i * 399);

		const actual = actualWordsRead(positions);
		expect(expectedWordsRead(positions)).toBe(14 * 399);
		expect(actual).toBeLessThan(1200);
		expect(actual).toBeGreaterThan(0);
	});
});
