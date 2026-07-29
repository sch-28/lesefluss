/**
 * Property test for words-read accounting. The example-based tests next door
 * missed two whole classes of error (a peek-ahead suppressing all later credit,
 * and re-entering a skipped gap), so this compares the tracker against an
 * independent reference over random tick sequences instead.
 */
import { describe, expect, it } from "vitest";
import { POLL_MS, type SessionRow, SessionTracker } from "../session-tracker";

const SCROLL_JUMP_THRESHOLD = 400;
const SEQUENCES = 200_000;

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
	clock += 20_000;
	for (index = 1; index < positions.length; index++) {
		clock += POLL_MS;
		tracker.tick();
	}
	tracker.finalize();
	return persisted.at(-1)?.wordsRead ?? 0;
}

/** Deterministic LCG so a failure is reproducible from the seed alone. */
function seededRandom(seed: number): () => number {
	let state = seed;
	return () => {
		state = (state * 1103515245 + 12345) & 0x7fffffff;
		return state / 0x7fffffff;
	};
}

function randomPositions(random: () => number): number[] {
	const positions = [0];
	const length = 3 + Math.floor(random() * 14);
	for (let i = 1; i < length; i++) {
		const previous = positions[i - 1] as number;
		const roll = random();
		if (roll < 0.55) positions.push(previous + Math.floor(random() * (SCROLL_JUMP_THRESHOLD - 1)));
		else if (roll < 0.7)
			positions.push(Math.max(0, previous - Math.floor(random() * (SCROLL_JUMP_THRESHOLD - 1))));
		else positions.push(Math.floor(random() * 50_000));
	}
	return positions;
}

describe("SessionTracker words-read accounting", () => {
	it("matches the union of forward reading moves over random sequences", () => {
		const random = seededRandom(12_345);
		const mismatches: Array<{ positions: number[]; expected: number; actual: number }> = [];

		for (let i = 0; i < SEQUENCES; i++) {
			const positions = randomPositions(random);
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
});
