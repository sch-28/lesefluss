import { calcDelay, type RsvpSettings, wpmFrom } from "@lesefluss/core";
import { describe, expect, it } from "vitest";
import { pickPassage, SPEED_TEST_PASSAGES } from "../../../components/speed-test/passages";
import { trendTestMarkers } from "../aggregate";
import {
	countWords,
	isPlausibleWpm,
	MIN_RSVP_WORDS,
	rsvpDelays,
	rsvpWpm,
	stepDial,
	suggestDial,
} from "../speed-test";

const settings: RsvpSettings = {
	wpm: 450,
	delayComma: 2,
	delayPeriod: 3,
	accelStart: 2,
	accelRate: 0.1,
	xOffset: 30,
	focalLetterColor: "#ff0000",
};

describe("suggestDial", () => {
	it("is half again the reading speed, on the 25 grid", () => {
		expect(suggestDial(250)).toBe(375);
		expect(suggestDial(310)).toBe(475);
	});

	it("stays between 300 and 700", () => {
		expect(suggestDial(120)).toBe(300);
		expect(suggestDial(900)).toBe(700);
	});
});

describe("stepDial", () => {
	it("moves 25 per step and stops at 250 and 800", () => {
		expect(stepDial(450, 1)).toBe(475);
		expect(stepDial(450, -1)).toBe(425);
		expect(stepDial(250, -1)).toBe(250);
		expect(stepDial(800, 1)).toBe(800);
	});
});

describe("isPlausibleWpm", () => {
	it("keeps 120 to 900", () => {
		expect(isPlausibleWpm(119)).toBe(false);
		expect(isPlausibleWpm(120)).toBe(true);
		expect(isPlausibleWpm(900)).toBe(true);
		expect(isPlausibleWpm(901)).toBe(false);
	});
});

describe("rsvpDelays", () => {
	it("chains the engine's delay and ramp word by word", () => {
		const words = ["The", "canal,", "slow", "and", "brown.", "Boats", "passed."];
		let acceleration = 0;
		const expected = words.map((w) => {
			const { delayMs, nextAcceleration } = calcDelay(w, settings, acceleration);
			acceleration = nextAcceleration;
			return delayMs;
		});
		expect(rsvpDelays(words, settings)).toEqual(expected);
	});
});

describe("rsvpWpm", () => {
	const words = SPEED_TEST_PASSAGES[0].rsvp.split(/\s+/);
	const delays = rsvpDelays(words, settings);

	it("says nothing below the minimum word count", () => {
		expect(rsvpWpm(delays, MIN_RSVP_WORDS - 1)).toBeNull();
	});

	it("is the words shown over their display time", () => {
		const shown = 40;
		const ms = delays.slice(0, shown).reduce((s, d) => s + d, 0);
		expect(rsvpWpm(delays, shown)).toBe(wpmFrom(shown, ms));
	});

	it("runs under the dial, since punctuation pauses and the ramp cost time", () => {
		expect(rsvpWpm(delays, words.length)).toBeLessThan(settings.wpm);
	});
});

describe("passages", () => {
	it("give each round enough words", () => {
		for (const p of SPEED_TEST_PASSAGES) {
			expect(countWords(p.read.join(" "))).toBeGreaterThan(150);
			expect(countWords(p.rsvp)).toBeGreaterThan(MIN_RSVP_WORDS);
		}
	});

	it("avoid the passage used last time", () => {
		for (const p of SPEED_TEST_PASSAGES) expect(pickPassage(p.id).id).not.toBe(p.id);
	});
});

describe("trendTestMarkers", () => {
	const starts = [100, 200, 300];

	it("puts each test on the last bucket started by then, oldest first", () => {
		expect(
			trendTestMarkers(
				[
					{ takenAt: 350, wpm: 300 },
					{ takenAt: 200, wpm: 250 },
					{ takenAt: 150, wpm: 240 },
				],
				starts,
			),
		).toEqual([
			{ bucketIndex: 0, wpm: 240, takenAt: 150 },
			{ bucketIndex: 1, wpm: 250, takenAt: 200 },
			{ bucketIndex: 2, wpm: 300, takenAt: 350 },
		]);
	});

	it("drops a test before the first bucket and one without a figure", () => {
		expect(
			trendTestMarkers(
				[
					{ takenAt: 50, wpm: 300 },
					{ takenAt: 250, wpm: null },
				],
				starts,
			),
		).toEqual([]);
	});
});
